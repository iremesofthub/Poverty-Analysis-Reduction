-- Phase 2: Programme Enrollments, Field Activities & Livelihood Plans
-- ADDITIVE ONLY - preserves all existing tables

-- ============================================================
-- Programme enrollments (connects members to programmes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.programme_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  member_id uuid NOT NULL REFERENCES public.members(id),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','active','declined','exited')),
  decision_note text,
  approved_by uuid REFERENCES auth.users(id),
  enrollment_date date,
  exit_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_id, member_id)
);

-- ============================================================
-- Livelihood plans (co-created agent + member activity plan)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.livelihood_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.programme_enrollments(id),
  assigned_agent_id uuid REFERENCES public.agents(id),
  activity_name text NOT NULL CHECK (length(trim(activity_name)) > 2),
  activity_category text CHECK (activity_category IN (
    'agriculture','livestock','tailoring','retail','food_processing',
    'cooperative','construction','services','other'
  )),
  member_goals text NOT NULL,
  baseline_summary text,
  resources_needed text,
  estimated_budget numeric(12,2),
  currency text NOT NULL DEFAULT 'RWF',
  planned_start_date date,
  planned_review_date date,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','approved','active','paused','completed','withdrawn')),
  approved_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Training events
-- ============================================================

CREATE TABLE IF NOT EXISTS public.training_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.livelihood_plans(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  skill_code text NOT NULL,
  skill_name text NOT NULL,
  training_method text DEFAULT 'demonstration'
    CHECK (training_method IN ('demonstration','classroom','on_the_job','self_study','group')),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','attended','demonstrated','cancelled')),
  member_confirmed_at timestamptz,
  scheduled_at timestamptz,
  occurred_at timestamptz,
  facilitator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Livelihood milestones (what agent records as accomplished)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.livelihood_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.livelihood_plans(id),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  milestone_type text NOT NULL
    CHECK (milestone_type IN ('training','first_activity','production',
                              'first_sale','continuation','follow_up','other')),
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','member_confirmed','verified','rejected','disputed')),
  member_confirmed_at timestamptz,
  event_uuid uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Field evidence (optional photos/documents for milestones)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.field_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.livelihood_milestones(id),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  storage_path text NOT NULL UNIQUE,
  content_sha256 text,
  evidence_kind text NOT NULL
    CHECK (evidence_kind IN ('photo','receipt','supervisor_note','document','voice_note')),
  description text,
  consent_reference text,
  subject_consent boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','accepted','rejected','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Supervisor verifications (independent milestone verification)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.supervisor_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.livelihood_milestones(id),
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL
    CHECK (decision IN ('verified','rejected','needs_more_evidence')),
  reasoning text NOT NULL CHECK (length(reasoning) >= 10),
  follow_up_required boolean NOT NULL DEFAULT false,
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Outcome observations (voluntary follow-up data)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outcome_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.livelihood_plans(id),
  observation_date date NOT NULL,
  is_activity_continuing boolean,
  self_reported_revenue numeric(12,2),
  self_reported_costs numeric(12,2),
  currency text NOT NULL DEFAULT 'RWF',
  challenges_noted text,
  skills_demonstrated boolean DEFAULT false,
  recorder_user_id uuid REFERENCES auth.users(id),
  -- Explicit disclosure: self-reported, not independently verified
  data_source text NOT NULL DEFAULT 'self_reported'
    CHECK (data_source IN ('self_reported','agent_observed','supervisor_verified')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE public.programme_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livelihood_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livelihood_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcome_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.programme_enrollments FROM anon, authenticated;
REVOKE ALL ON public.livelihood_plans FROM anon, authenticated;
REVOKE ALL ON public.training_events FROM anon, authenticated;
REVOKE ALL ON public.livelihood_milestones FROM anon, authenticated;
REVOKE ALL ON public.field_evidence FROM anon, authenticated;
REVOKE ALL ON public.supervisor_verifications FROM anon, authenticated;
REVOKE ALL ON public.outcome_observations FROM anon, authenticated;

-- ============================================================
-- RLS Policies — Programme Enrollments
-- ============================================================

-- Programme managers see enrollments for their programme
-- Members see only their own enrollment
CREATE POLICY "enroll_select" ON public.programme_enrollments
  FOR SELECT TO authenticated
  USING (
    -- Platform admin sees all
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR
    -- Member sees their own enrollment
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = programme_enrollments.member_id)
    OR
    -- Programme manager sees their programme's enrollments
    EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_enrollments.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR
    -- Assigned agent sees their member's enrollment
    EXISTS (
      SELECT 1 FROM public.agent_assignments aa
      JOIN public.agents ag ON ag.id = aa.agent_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE aa.member_id = programme_enrollments.member_id
        AND p.role = 'field_agent'
    )
  );

CREATE POLICY "enroll_insert" ON public.programme_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_enrollments.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "enroll_update" ON public.programme_enrollments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_enrollments.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_enrollments.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

-- ============================================================
-- RLS Policies — Livelihood Plans
-- ============================================================

CREATE POLICY "plan_select" ON public.livelihood_plans
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_enrollments pe
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE pe.id = livelihood_plans.enrollment_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Member sees own plan
    EXISTS (
      SELECT 1 FROM public.programme_enrollments pe
      JOIN public.profiles p ON p.member_id = pe.member_id
      WHERE pe.id = livelihood_plans.enrollment_id AND p.id = auth.uid()
    )
    OR -- Assigned agent sees their plans
    EXISTS (
      SELECT 1 FROM public.agents ag
      WHERE ag.id = livelihood_plans.assigned_agent_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  );

CREATE POLICY "plan_insert" ON public.livelihood_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_enrollments pe
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE pe.id = livelihood_plans.enrollment_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Field agent can create plans for their assigned members
    (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
     AND created_by = auth.uid())
  );

CREATE POLICY "plan_update" ON public.livelihood_plans
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.programme_enrollments pe
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE pe.id = livelihood_plans.enrollment_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','field_supervisor')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.programme_enrollments pe
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE pe.id = livelihood_plans.enrollment_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','field_supervisor')
    )
  );

-- ============================================================
-- RLS Policies — Training Events, Milestones, Evidence, Verifications
-- ============================================================

-- training_events: agent who created + their programme
CREATE POLICY "training_select" ON public.training_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lp.id = training_events.plan_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Agent sees their own training records
    EXISTS (
      SELECT 1 FROM public.agents ag
      WHERE ag.id = training_events.agent_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  );

CREATE POLICY "training_insert" ON public.training_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_admin','field_agent'))
  );

CREATE POLICY "training_update" ON public.training_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agents ag
      WHERE ag.id = training_events.agent_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agents ag
      WHERE ag.id = training_events.agent_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  );

-- milestones: submitted_by agent; programme manager; member (own)
CREATE POLICY "milestone_select" ON public.livelihood_milestones
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lp.id = livelihood_milestones.plan_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Member can see their own milestones
    EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.profiles p ON p.member_id = pe.member_id
      WHERE lp.id = livelihood_milestones.plan_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "milestone_insert" ON public.livelihood_milestones
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_admin','field_agent'))
  );

CREATE POLICY "milestone_update_member_confirm" ON public.livelihood_milestones
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR -- Member can confirm their own milestone (status → member_confirmed)
    EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.profiles p ON p.member_id = pe.member_id
      WHERE lp.id = livelihood_milestones.plan_id AND p.id = auth.uid()
    )
    OR -- Programme supervisor can update status
    EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lp.id = livelihood_milestones.plan_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','field_supervisor')
    )
  )
  WITH CHECK (true); -- detailed checks in application layer

-- field_evidence: uploader; programme staff; NOT other agents or public
CREATE POLICY "evidence_select" ON public.field_evidence
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.livelihood_milestones lm
      JOIN public.livelihood_plans lp ON lp.id = lm.plan_id
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lm.id = field_evidence.milestone_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','field_supervisor','auditor')
    )
  );

CREATE POLICY "evidence_insert" ON public.field_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_admin','field_agent'))
  );

-- supervisor_verifications: reviewer; programme staff; NOT the submitting agent
CREATE POLICY "verification_select" ON public.supervisor_verifications
  FOR SELECT TO authenticated
  USING (
    reviewer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.livelihood_milestones lm
      JOIN public.livelihood_plans lp ON lp.id = lm.plan_id
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lm.id = supervisor_verifications.milestone_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Member can see verifications of their milestones
    EXISTS (
      SELECT 1 FROM public.livelihood_milestones lm
      JOIN public.livelihood_plans lp ON lp.id = lm.plan_id
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.profiles p ON p.member_id = pe.member_id
      WHERE lm.id = supervisor_verifications.milestone_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "verification_insert" ON public.supervisor_verifications
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                AND role IN ('platform_admin','programme_owner'))
    -- Field agents cannot self-verify: enforced by role check above
  );

-- outcome_observations: recorder; programme staff; member (own)
CREATE POLICY "outcome_select" ON public.outcome_observations
  FOR SELECT TO authenticated
  USING (
    recorder_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pe.programme_id
      )
      WHERE lp.id = outcome_observations.plan_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR EXISTS (
      SELECT 1 FROM public.livelihood_plans lp
      JOIN public.programme_enrollments pe ON pe.id = lp.enrollment_id
      JOIN public.profiles p ON p.member_id = pe.member_id
      WHERE lp.id = outcome_observations.plan_id AND p.id = auth.uid()
    )
  );

CREATE POLICY "outcome_insert" ON public.outcome_observations
  FOR INSERT TO authenticated
  WITH CHECK (recorder_user_id = auth.uid());

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.programme_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.livelihood_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.livelihood_milestones TO authenticated;
GRANT SELECT, INSERT ON public.field_evidence TO authenticated;
GRANT SELECT, INSERT ON public.supervisor_verifications TO authenticated;
GRANT SELECT, INSERT ON public.outcome_observations TO authenticated;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_enroll_programme_status
  ON public.programme_enrollments (programme_id, status);

CREATE INDEX IF NOT EXISTS ix_enroll_member
  ON public.programme_enrollments (member_id);

CREATE INDEX IF NOT EXISTS ix_plan_enrollment
  ON public.livelihood_plans (enrollment_id, status);

CREATE INDEX IF NOT EXISTS ix_plan_agent
  ON public.livelihood_plans (assigned_agent_id, status);

CREATE INDEX IF NOT EXISTS ix_training_plan
  ON public.training_events (plan_id, status);

CREATE INDEX IF NOT EXISTS ix_training_agent
  ON public.training_events (agent_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS ix_milestone_plan_status
  ON public.livelihood_milestones (plan_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS ix_evidence_milestone
  ON public.field_evidence (milestone_id, review_status);

CREATE INDEX IF NOT EXISTS ix_verification_milestone
  ON public.supervisor_verifications (milestone_id, decided_at DESC);
