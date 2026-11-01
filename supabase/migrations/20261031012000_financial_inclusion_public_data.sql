create table if not exists public.financial_inclusion_sources (
  source_id text primary key,
  publisher text not null,
  title text not null,
  source_url text not null,
  period_label text,
  publication_date date,
  retrieval_date timestamptz not null,
  license text not null,
  license_url text,
  local_file text,
  sha256 text,
  content_type text,
  byte_size bigint,
  extraction_method text,
  geography_available text[] not null default '{}',
  status text not null check (status in ('Imported','Published but not downloaded','Access restricted','Not available','Validation failed','Superseded')),
  limitation text,
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_inclusion_observations (
  observation_id text primary key,
  source_id text not null references public.financial_inclusion_sources(source_id),
  indicator text not null,
  indicator_label text not null,
  value numeric not null,
  unit text not null,
  period_start date,
  period_end date,
  geography_level text not null check (geography_level in ('national','province','district')),
  geography_code text,
  geography_name text,
  population text not null,
  denominator text not null,
  provider_class text,
  product text,
  segment_type text,
  segment text,
  table_reference text not null,
  methodology text not null,
  quality_flags text[] not null default '{}',
  transformation text not null default 'Published value; no numeric transformation',
  created_at timestamptz not null default now(),
  check (unit <> 'percent' or (value >= 0 and value <= 100))
);

create index if not exists financial_inclusion_observations_lookup
  on public.financial_inclusion_observations (indicator, period_end, geography_level);

alter table public.financial_inclusion_sources enable row level security;
alter table public.financial_inclusion_observations enable row level security;

drop policy if exists "public read published financial inclusion sources" on public.financial_inclusion_sources;
create policy "public read published financial inclusion sources"
  on public.financial_inclusion_sources for select to anon, authenticated using (true);
drop policy if exists "public read financial inclusion observations" on public.financial_inclusion_observations;
create policy "public read financial inclusion observations"
  on public.financial_inclusion_observations for select to anon, authenticated using (true);

grant select on public.financial_inclusion_sources to anon, authenticated;
grant select on public.financial_inclusion_observations to anon, authenticated;
