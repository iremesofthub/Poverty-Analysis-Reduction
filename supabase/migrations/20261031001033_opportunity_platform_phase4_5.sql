-- Phase 4 & 5: Cooperative Financial Records, Action Requests & Audit Events
-- ADDITIVE ONLY

-- ============================================================
-- Cooperative financial entries (savings contributions, loans)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cooperative_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  entry_type text NOT NULL
    CHECK (entry_type IN ('contribution','withdrawal','loan_disbursement','loan_repayment',
                          'dividend','fee','penalty','other')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'RWF',
  period_label text, -- e.g. "October 2026"
  description text,
  reference_code text, -- receipt or external reference
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','disputed','reversed')),
  recorded_by uuid REFERENCES auth.users(id),
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Financial diaries (household income/expense tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id),
  entry_date date NOT NULL,
  entry_type text NOT NULL
    CHECK (entry_type IN ('income','expense','asset_purchase','debt_payment','other')),
  category text,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'RWF',
  -- Self-reported: not independently verified income evidence
  data_source text NOT NULL DEFAULT 'self_reported',
  -- Access control: who can see this entry
  shared_with_agent boolean NOT NULL DEFAULT false,
  shared_with_programme boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Operational action requests (analyst → programme cross-panel)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.operational_action_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_to uuid REFERENCES auth.users(id),
  district_code text,
  sector_code text,
  subject text NOT NULL CHECK (length(trim(subject)) > 5),
  description text,
  -- Safe aggregate reference only - never raw survey respondent IDs
  source_evidence_ref text,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  state text NOT NULL DEFAULT 'submitted'
    CHECK (state IN ('submitted','accepted','declined','in_progress',
                     'completed','closed','appealed')),
  outcome_description text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Action request updates (timeline of state changes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.action_request_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.operational_action_requests(id),
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  previous_state text,
  new_state text,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Support cases (member-reported issues / complaints)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id),
  programme_id uuid REFERENCES public.programme_catalog(id),
  case_type text NOT NULL
    CHECK (case_type IN ('payment_issue','service_complaint','eligibility_dispute',
                         'evidence_correction','other')),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','in_progress','resolved','closed','escalated')),
  assigned_to uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.support_cases(id),
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Operational audit events (append-only compliance log)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.operational_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id),
  entity_kind text NOT NULL
    CHECK (entity_kind IN ('job_posting','job_application','enrollment','livelihood_plan',
                           'milestone','evidence','payment_instruction','provider_event',
                           'referral','action_request','support_case','contract')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  source_status text NOT NULL DEFAULT 'recorded'
    CHECK (source_status IN ('demo','recorded','pending_review','verified',
                              'provider_confirmed','disputed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
  -- No UPDATE or DELETE: audit log is append-only
);

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE public.cooperative_financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_action_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_request_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cooperative_financial_entries FROM anon, authenticated;
REVOKE ALL ON public.financial_diaries FROM anon, authenticated;
REVOKE ALL ON public.operational_action_requests FROM anon, authenticated;
REVOKE ALL ON public.action_request_updates FROM anon, authenticated;
REVOKE ALL ON public.support_cases FROM anon, authenticated;
REVOKE ALL ON public.case_updates FROM anon, authenticated;
REVOKE ALL ON public.operational_audit_events FROM anon, authenticated;

-- ============================================================
-- RLS Policies — Cooperative Financial Entries
-- ============================================================

-- Cooperative member sees their own; cooperative treasurer sees all in their coop
CREATE POLICY "coop_entry_select" ON public.cooperative_financial_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR -- Member sees their own entries
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = cooperative_financial_entries.member_id)
    OR -- Cooperative member/treasurer can see coop entries
    EXISTS (
      SELECT 1 FROM public.cooperative_memberships cm
      JOIN public.profiles p ON p.member_id = cm.member_id
      WHERE cm.cooperative_id = cooperative_financial_entries.cooperative_id
        AND p.id = auth.uid()
        AND cm.coop_role IN ('treasurer','chair','secretary')
    )
    OR -- Programme staff with access to cooperative
    EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      WHERE pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "coop_entry_insert" ON public.cooperative_financial_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR EXISTS (
        SELECT 1 FROM public.cooperative_memberships cm
        JOIN public.profiles p ON p.member_id = cm.member_id
        WHERE cm.cooperative_id = cooperative_financial_entries.cooperative_id
          AND p.id = auth.uid()
          AND cm.coop_role IN ('treasurer','chair')
      )
    )
  );

CREATE POLICY "coop_entry_update" ON public.cooperative_financial_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR recorded_by = auth.uid()
    OR verified_by = auth.uid()
  )
  WITH CHECK (true);

-- ============================================================
-- RLS Policies — Financial Diaries
-- ============================================================

-- Members see only their own diary
CREATE POLICY "diary_select" ON public.financial_diaries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = financial_diaries.member_id)
    OR (
      shared_with_agent = true
      AND EXISTS (
        SELECT 1 FROM public.agent_assignments aa
        WHERE aa.member_id = financial_diaries.member_id
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
      )
    )
    OR (
      shared_with_programme = true
      AND EXISTS (SELECT 1 FROM public.programme_org_memberships pom WHERE pom.user_id = auth.uid() AND pom.enabled = true)
    )
  );

CREATE POLICY "diary_insert" ON public.financial_diaries
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = financial_diaries.member_id)
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    )
  );

CREATE POLICY "diary_update_own" ON public.financial_diaries
  FOR UPDATE TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
  )
  WITH CHECK (true);

-- ============================================================
-- RLS Policies — Action Requests
-- ============================================================

-- Creator sees their own; assigned person sees; programme staff see theirs
CREATE POLICY "action_req_select" ON public.operational_action_requests
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_admin','nisr_analyst'))
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = operational_action_requests.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "action_req_insert" ON public.operational_action_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                AND role IN ('platform_admin','nisr_analyst','programme_owner','gov_district','gov_sector','gov_cell'))
  );

CREATE POLICY "action_req_update" ON public.operational_action_requests
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = operational_action_requests.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager')
    )
  )
  WITH CHECK (true);

-- Action request updates (timeline)
CREATE POLICY "req_update_select" ON public.action_request_updates
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.operational_action_requests oar
            WHERE oar.id = action_request_updates.request_id
              AND (oar.created_by = auth.uid() OR oar.assigned_to = auth.uid()
                   OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                               AND role IN ('platform_admin','nisr_analyst'))))
    OR EXISTS (
      SELECT 1 FROM public.operational_action_requests oar
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = oar.programme_id
      )
      WHERE oar.id = action_request_updates.request_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "req_update_insert" ON public.action_request_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.operational_action_requests oar
      WHERE oar.id = action_request_updates.request_id
        AND (oar.created_by = auth.uid() OR oar.assigned_to = auth.uid()
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin'))
    )
  );

-- ============================================================
-- RLS Policies — Support Cases
-- ============================================================

CREATE POLICY "case_select" ON public.support_cases
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = support_cases.member_id)
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = support_cases.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "case_insert" ON public.support_cases
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = support_cases.member_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

CREATE POLICY "case_update" ON public.support_cases
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = support_cases.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  )
  WITH CHECK (true);

CREATE POLICY "case_update_note_select" ON public.case_updates
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_cases sc
      WHERE sc.id = case_updates.case_id
        AND (sc.assigned_to = auth.uid()
             OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = sc.member_id)
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin'))
    )
  );

CREATE POLICY "case_update_note_insert" ON public.case_updates
  FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid());

-- ============================================================
-- Audit Events: append-only, no UPDATE/DELETE policies
-- ============================================================

CREATE POLICY "audit_select_admin" ON public.operational_audit_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR actor_user_id = auth.uid()
  );

CREATE POLICY "audit_insert" ON public.operational_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.cooperative_financial_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_diaries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operational_action_requests TO authenticated;
GRANT SELECT, INSERT ON public.action_request_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_cases TO authenticated;
GRANT SELECT, INSERT ON public.case_updates TO authenticated;
GRANT SELECT, INSERT ON public.operational_audit_events TO authenticated;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_coop_entry_coop_member
  ON public.cooperative_financial_entries (cooperative_id, member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_coop_entry_status
  ON public.cooperative_financial_entries (cooperative_id, status, entry_type);

CREATE INDEX IF NOT EXISTS ix_diary_member_date
  ON public.financial_diaries (member_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS ix_action_req_programme_state
  ON public.operational_action_requests (programme_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_action_req_assigned
  ON public.operational_action_requests (assigned_to, state);

CREATE INDEX IF NOT EXISTS ix_action_req_created
  ON public.operational_action_requests (created_by, state);

CREATE INDEX IF NOT EXISTS ix_req_update_request
  ON public.action_request_updates (request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_support_case_member
  ON public.support_cases (member_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_entity
  ON public.operational_audit_events (entity_kind, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_audit_actor
  ON public.operational_audit_events (actor_user_id, created_at DESC);
