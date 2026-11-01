-- Requests are separate from profiles: a browser may ask for an account type,
-- but it cannot grant itself a programme, cooperative, or member role.
CREATE TABLE public.account_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_role text NOT NULL CHECK (requested_role IN ('programme_owner', 'cooperative', 'beneficiary')),
  full_name text NOT NULL,
  phone text NOT NULL,
  organisation_name text,
  reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  review_note text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_access_request_name_length CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  CONSTRAINT account_access_request_phone_length CHECK (length(phone) BETWEEN 10 AND 16)
);

CREATE UNIQUE INDEX account_access_requests_one_open_request
  ON public.account_access_requests (user_id, requested_role)
  WHERE status = 'pending';
CREATE INDEX account_access_requests_review_queue
  ON public.account_access_requests (status, created_at DESC);

ALTER TABLE public.account_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_access_requests FROM anon, authenticated;
GRANT SELECT ON public.account_access_requests TO authenticated;

CREATE POLICY "access_request_select_own_or_admin"
  ON public.account_access_requests FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'platform_admin')
  );

CREATE OR REPLACE FUNCTION public.submit_signup_access_request(
  p_requested_role text,
  p_phone text,
  p_organisation_name text DEFAULT NULL,
  p_reference text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_request_id uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND OR v_profile.role <> 'job_applicant' THEN
    RAISE EXCEPTION 'Only a newly registered job-applicant profile can submit an access request';
  END IF;
  IF p_requested_role NOT IN ('programme_owner', 'cooperative', 'beneficiary') THEN
    RAISE EXCEPTION 'Unsupported account type';
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 16 THEN
    RAISE EXCEPTION 'Enter a valid phone number';
  END IF;
  IF p_requested_role IN ('programme_owner', 'cooperative')
     AND length(trim(coalesce(p_organisation_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter the organisation or cooperative name';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.account_access_requests
    WHERE user_id = (SELECT auth.uid()) AND requested_role = p_requested_role AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'You already have a request waiting for review';
  END IF;

  INSERT INTO public.account_access_requests (user_id, requested_role, full_name, phone, organisation_name, reference)
  VALUES ((SELECT auth.uid()), p_requested_role, left(coalesce(v_profile.full_name, 'Account holder'), 120), v_phone,
          nullif(left(trim(coalesce(p_organisation_name, '')), 120), ''), nullif(left(trim(coalesce(p_reference, '')), 80), ''))
  RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_signup_access_request(
  p_request_id uuid,
  p_decision text,
  p_linked_id uuid DEFAULT NULL,
  p_review_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.account_access_requests%ROWTYPE;
  v_programme_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'platform_admin') THEN
    RAISE EXCEPTION 'Only a platform administrator can review account requests';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  SELECT * INTO v_request FROM public.account_access_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is not waiting for review';
  END IF;

  IF p_decision = 'approved' THEN
    IF v_request.requested_role = 'beneficiary' THEN
      IF p_linked_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_linked_id) THEN
        RAISE EXCEPTION 'Select a valid program member record';
      END IF;
      IF EXISTS (SELECT 1 FROM public.profiles WHERE member_id = p_linked_id AND id <> v_request.user_id) THEN
        RAISE EXCEPTION 'That program member is already linked to another account';
      END IF;
      UPDATE public.profiles SET role = 'beneficiary', member_id = p_linked_id WHERE id = v_request.user_id;
    ELSIF v_request.requested_role = 'cooperative' THEN
      IF p_linked_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.cooperatives WHERE id = p_linked_id) THEN
        RAISE EXCEPTION 'Select a valid cooperative record';
      END IF;
      IF EXISTS (SELECT 1 FROM public.profiles WHERE cooperative_id = p_linked_id AND id <> v_request.user_id) THEN
        RAISE EXCEPTION 'That cooperative is already linked to another account';
      END IF;
      UPDATE public.profiles SET role = 'cooperative', cooperative_id = p_linked_id WHERE id = v_request.user_id;
    ELSE
      IF p_linked_id IS NULL THEN RAISE EXCEPTION 'Select a programme organisation'; END IF;
      SELECT pc.name INTO v_programme_name FROM public.programme_catalog pc
      WHERE pc.organization_id = p_linked_id AND pc.status IN ('approved', 'active')
      ORDER BY pc.created_at LIMIT 1;
      IF v_programme_name IS NULL THEN RAISE EXCEPTION 'The selected organisation needs an approved or active programme'; END IF;
      UPDATE public.profiles SET role = 'programme_owner', programme = v_programme_name WHERE id = v_request.user_id;
      INSERT INTO public.programme_org_memberships (organization_id, user_id, delegated_role, enabled)
      VALUES (p_linked_id, v_request.user_id, 'org_admin', true)
      ON CONFLICT (organization_id, user_id, delegated_role) DO UPDATE SET enabled = true;
    END IF;
  END IF;

  UPDATE public.account_access_requests
  SET status = p_decision, review_note = nullif(left(trim(coalesce(p_review_note, '')), 500), ''),
      reviewed_by = (SELECT auth.uid()), reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_signup_access_request(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_signup_access_request(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_signup_access_request(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_signup_access_request(uuid, text, uuid, text) TO authenticated;
