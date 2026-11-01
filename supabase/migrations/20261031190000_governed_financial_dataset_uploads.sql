-- Governed intake for public aggregate financial-inclusion datasets.
-- Files are parsed in the browser; only approved aggregate rows enter the public evidence tables.

create table if not exists public.financial_inclusion_uploads (
  id uuid primary key default gen_random_uuid(),
  source_id text not null unique check (source_id ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  title text not null check (length(trim(title)) between 3 and 240),
  publisher text not null check (length(trim(publisher)) between 2 and 160),
  source_url text not null check (source_url ~ '^https?://'),
  period_label text not null check (length(trim(period_label)) between 3 and 80),
  publication_date date,
  license text not null check (length(trim(license)) between 2 and 500),
  status text not null default 'draft' check (status in ('draft','approved','rejected','superseded')),
  row_count integer not null check (row_count between 1 and 5000),
  metadata jsonb not null default '{}'::jsonb,
  observations jsonb not null,
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 500),
  constraint financial_inclusion_uploads_observations_array check (jsonb_typeof(observations) = 'array')
);

create index if not exists financial_inclusion_uploads_queue
  on public.financial_inclusion_uploads (status, submitted_at desc);

alter table public.financial_inclusion_uploads enable row level security;
revoke all on public.financial_inclusion_uploads from anon, authenticated;
grant select on public.financial_inclusion_uploads to authenticated;

create policy "financial upload queue is visible to evidence staff"
  on public.financial_inclusion_uploads for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('platform_admin','nisr_analyst')
  ));

create or replace function public.submit_financial_inclusion_upload(
  p_metadata jsonb,
  p_observations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload_id uuid;
  v_source_id text := lower(trim(coalesce(p_metadata->>'source_id', '')));
  v_row_count integer := coalesce(jsonb_array_length(p_observations), 0);
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('platform_admin','nisr_analyst')
  ) then
    raise exception 'Only a platform administrator or NISR analyst can submit a dataset draft';
  end if;
  if jsonb_typeof(p_metadata) <> 'object' or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Dataset metadata and observations must be valid JSON objects';
  end if;
  if v_source_id !~ '^[a-z0-9][a-z0-9-]{2,79}$' then
    raise exception 'Use a lower-case source ID with letters, numbers, and hyphens';
  end if;
  if v_row_count < 1 or v_row_count > 5000 then
    raise exception 'A dataset draft must contain between 1 and 5,000 aggregate rows';
  end if;
  if coalesce(length(trim(p_metadata->>'title')), 0) < 3
     or coalesce(length(trim(p_metadata->>'publisher')), 0) < 2
     or coalesce(length(trim(p_metadata->>'period_label')), 0) < 3
     or coalesce(length(trim(p_metadata->>'license')), 0) < 2
     or coalesce(p_metadata->>'source_url', '') !~ '^https?://' then
    raise exception 'Add title, publisher, source URL, period, and license before submitting';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_observations) as x(
      observation_id text, indicator text, indicator_label text, value numeric, unit text,
      period_start date, period_end date, geography_level text, geography_code text, geography_name text,
      population text, denominator text, table_reference text, methodology text
    ) where coalesce(trim(x.observation_id),'') = '' or coalesce(trim(x.indicator),'') = ''
      or coalesce(trim(x.indicator_label),'') = '' or x.value is null or coalesce(trim(x.unit),'') = ''
      or x.period_end is null or x.geography_level not in ('national','province','district')
      or (x.geography_level <> 'national' and coalesce(trim(x.geography_code),'') = '')
      or coalesce(trim(x.population),'') = '' or coalesce(trim(x.denominator),'') = ''
      or coalesce(trim(x.table_reference),'') = '' or coalesce(trim(x.methodology),'') = ''
      or (x.unit = 'percent' and (x.value < 0 or x.value > 100))
  ) then
    raise exception 'One or more rows are incomplete, use an invalid geography, or have a percentage outside 0–100';
  end if;
  if exists (
    select 1 from (
      select x.observation_id from jsonb_to_recordset(p_observations) as x(observation_id text)
      group by x.observation_id having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Every observation ID must be unique within the uploaded file';
  end if;
  insert into public.financial_inclusion_uploads (
    source_id,title,publisher,source_url,period_label,publication_date,license,row_count,metadata,observations,submitted_by
  ) values (
    v_source_id,trim(p_metadata->>'title'),trim(p_metadata->>'publisher'),trim(p_metadata->>'source_url'),
    trim(p_metadata->>'period_label'),nullif(p_metadata->>'publication_date','')::date,trim(p_metadata->>'license'),
    v_row_count,p_metadata,p_observations,(select auth.uid())
  ) returning id into v_upload_id;
  return v_upload_id;
end;
$$;

create or replace function public.review_financial_inclusion_upload(
  p_upload_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upload public.financial_inclusion_uploads%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'platform_admin'
  ) then
    raise exception 'Only a platform administrator can publish or reject a dataset';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  select * into v_upload from public.financial_inclusion_uploads where id = p_upload_id for update;
  if not found or v_upload.status <> 'draft' then
    raise exception 'This dataset is not waiting for review';
  end if;
  if p_decision = 'approved' then
    insert into public.financial_inclusion_sources (
      source_id,publisher,title,source_url,period_label,publication_date,retrieval_date,license,
      extraction_method,geography_available,status,limitation
    ) values (
      v_upload.source_id,v_upload.publisher,v_upload.title,v_upload.source_url,v_upload.period_label,
      v_upload.publication_date,now(),v_upload.license,'Aggregate CSV uploaded and approved in Ireme Insight',
      array(select distinct x.geography_level from jsonb_to_recordset(v_upload.observations) as x(geography_level text)),
      'Imported','Submitted through the governed aggregate-data upload workflow; see upload review record.'
    );
    insert into public.financial_inclusion_observations (
      observation_id,source_id,indicator,indicator_label,value,unit,period_start,period_end,geography_level,
      geography_code,geography_name,population,denominator,provider_class,product,segment_type,segment,
      table_reference,methodology,quality_flags,transformation
    ) select
      x.observation_id,v_upload.source_id,x.indicator,x.indicator_label,x.value,x.unit,x.period_start,x.period_end,
      x.geography_level,nullif(x.geography_code,''),nullif(x.geography_name,''),x.population,x.denominator,
      nullif(x.provider_class,''),nullif(x.product,''),nullif(x.segment_type,''),nullif(x.segment,''),
      x.table_reference,x.methodology,coalesce(x.quality_flags,array[]::text[]),
      coalesce(nullif(x.transformation,''),'Published value; no numeric transformation')
    from jsonb_to_recordset(v_upload.observations) as x(
      observation_id text,indicator text,indicator_label text,value numeric,unit text,period_start date,period_end date,
      geography_level text,geography_code text,geography_name text,population text,denominator text,provider_class text,
      product text,segment_type text,segment text,table_reference text,methodology text,quality_flags text[],transformation text
    );
  end if;
  update public.financial_inclusion_uploads
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(p_review_note,'')),500),'')
  where id = p_upload_id;
end;
$$;

revoke all on function public.submit_financial_inclusion_upload(jsonb,jsonb) from public, anon;
revoke all on function public.review_financial_inclusion_upload(uuid,text,text) from public, anon;
grant execute on function public.submit_financial_inclusion_upload(jsonb,jsonb) to authenticated;
grant execute on function public.review_financial_inclusion_upload(uuid,text,text) to authenticated;
