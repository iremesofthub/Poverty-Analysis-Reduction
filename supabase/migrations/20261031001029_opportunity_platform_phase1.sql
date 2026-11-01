-- Phase 1: Programme Organizations, Jobs & Recruitment
-- ADDITIVE ONLY - does not drop or rename existing tables
-- Existing tables preserved: profiles, members, agents, agent_assignments, visits, cooperatives, etc.

-- ============================================================
-- Programme organizations & catalogue
-- ============================================================

CREATE TABLE IF NOT EXISTS public.programme_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 1),
  legal_kind text NOT NULL DEFAULT 'government'
    CHECK (legal_kind IN ('government','ngo','cooperative','partner')),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','suspended')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.programme_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.programme_organizations(id),
  name text NOT NULL CHECK (length(trim(name)) > 1),
  purpose text NOT NULL,
  district_code text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','active','closed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Maps auth.users to programme orgs with delegated roles
CREATE TABLE IF NOT EXISTS public.programme_org_memberships (
  organization_id uuid NOT NULL REFERENCES public.programme_organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  delegated_role text NOT NULL
    CHECK (delegated_role IN ('org_admin','hr','recruiter','assessor','field_supervisor',
                              'programme_manager','paymaster','financial_reviewer','auditor')),
  district_scope text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, delegated_role)
);

-- ============================================================
-- Agent job postings & recruitment
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  title text NOT NULL CHECK (length(trim(title)) > 2),
  description text NOT NULL,
  employment_type text NOT NULL DEFAULT 'field_agent',
  district_code text,
  location_description text,
  sector_code text,
  required_competencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  slots integer NOT NULL DEFAULT 1 CHECK (slots > 0 AND slots <= 10000),
  positions_count integer NOT NULL DEFAULT 1 CHECK (positions_count > 0 AND positions_count <= 10000),
  salary_min numeric(12,2) CHECK (salary_min >= 0),
  salary_max numeric(12,2) CHECK (salary_max >= 0 AND (salary_min IS NULL OR salary_max >= salary_min)),
  salary_currency text NOT NULL DEFAULT 'RWF',
  salary_terms text,
  closes_at timestamptz,
  application_deadline timestamptz,
  exam_date timestamptz,
  exam_time text,
  exam_venue text,
  interview_date timestamptz,
  interview_time text,
  interview_venue text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','published','paused','closed','filled','cancelled')),
  published_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES public.agent_job_postings(id),
  applicant_user_id uuid NOT NULL REFERENCES public.profiles(id),
  competency_statement text NOT NULL
    CHECK (length(competency_statement) >= 10 AND length(competency_statement) <= 3000),
  education_level text,
  education_institution text,
  education_field text,
  education_grad_year integer CHECK (education_grad_year BETWEEN 1900 AND 2200),
  years_experience integer DEFAULT 0 CHECK (years_experience >= 0),
  work_experience_years numeric(5,2) NOT NULL DEFAULT 0 CHECK (work_experience_years >= 0),
  skills_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills_self_reported jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_roles text,
  languages_spoken jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_note text,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','shortlisted','exam_scheduled',
                      'screening','assessment','interview_scheduled','interview',
                      'offered','hired','rejected','contracted','withdrawn')),
  decision_reason text,
  decision_rationale text,
  decided_by uuid REFERENCES auth.users(id),
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_decision_reason_check CHECK (
    status NOT IN ('offered','rejected')
    OR length(trim(coalesce(decision_reason, decision_rationale, ''))) >= 10
  ),
  UNIQUE (posting_id, applicant_user_id)
);

CREATE TABLE IF NOT EXISTS public.candidate_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.agent_job_applications(id),
  assessed_by uuid NOT NULL REFERENCES auth.users(id),
  rubric_version text NOT NULL DEFAULT 'v1',
  competency_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_score numeric(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
  score numeric(5,2) CHECK (score >= 0 AND score <= 100),
  passed boolean,
  assessor_id uuid REFERENCES auth.users(id),
  notes text,
  reviewer_note text,
  assessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.agent_job_postings(id),
  application_id uuid REFERENCES public.agent_job_applications(id),
  slot_start timestamptz NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','cancelled')),
  venue text,
  interviewer_user_id uuid REFERENCES auth.users(id),
  outcome text CHECK (outcome IN ('pending','passed','failed','no_show','rescheduled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.agent_job_applications(id),
  job_id uuid NOT NULL REFERENCES public.agent_job_postings(id),
  agent_id uuid REFERENCES public.agents(id),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  contract_terms text,
  start_date date,
  end_date date,
  monthly_wage numeric(12,2) CHECK (monthly_wage > 0),
  currency text NOT NULL DEFAULT 'RWF',
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','signed','active','completed','terminated')),
  signed_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Enable RLS on all new tables
-- ============================================================

ALTER TABLE public.programme_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_org_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_contracts ENABLE ROW LEVEL SECURITY;

-- Revoke all public access first
REVOKE ALL ON public.programme_organizations FROM anon, authenticated;
REVOKE ALL ON public.programme_catalog FROM anon, authenticated;
REVOKE ALL ON public.programme_org_memberships FROM anon, authenticated;
REVOKE ALL ON public.agent_job_postings FROM anon, authenticated;
REVOKE ALL ON public.agent_job_applications FROM anon, authenticated;
REVOKE ALL ON public.candidate_assessments FROM anon, authenticated;
REVOKE ALL ON public.interview_slots FROM anon, authenticated;
REVOKE ALL ON public.agent_contracts FROM anon, authenticated;

-- ============================================================
-- RLS Policies
-- ============================================================

-- programme_organizations: platform_admin sees all; org members see their org
CREATE POLICY "org_select_admin" ON public.programme_organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR
    EXISTS (SELECT 1 FROM public.programme_org_memberships
            WHERE organization_id = programme_organizations.id
              AND user_id = auth.uid() AND enabled = true)
  );

CREATE POLICY "org_insert_admin" ON public.programme_organizations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
  );

-- programme_catalog: platform_admin sees all; programme_owner sees own org's programmes
CREATE POLICY "catalog_select" ON public.programme_catalog
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('platform_admin','nisr_analyst'))
    OR
    EXISTS (SELECT 1 FROM public.programme_org_memberships
            WHERE organization_id = programme_catalog.organization_id
              AND user_id = auth.uid() AND enabled = true)
    OR
    -- Government can see active programmes in their district
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('gov_district','gov_sector','gov_cell'))
  );

CREATE POLICY "catalog_insert_org_admin" ON public.programme_catalog
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR
    EXISTS (SELECT 1 FROM public.programme_org_memberships
            WHERE organization_id = programme_catalog.organization_id
              AND user_id = auth.uid() AND enabled = true
              AND delegated_role IN ('org_admin','programme_manager'))
  );

-- agent_job_postings: published jobs are visible to all authenticated; draft only to org members
CREATE POLICY "postings_select_published" ON public.agent_job_postings
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = agent_job_postings.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "postings_insert_hr" ON public.agent_job_postings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = agent_job_postings.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  );

CREATE POLICY "postings_update_hr" ON public.agent_job_postings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = agent_job_postings.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = agent_job_postings.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  );

-- agent_job_applications: applicants see own; HR sees all for their programme
CREATE POLICY "applications_select_own" ON public.agent_job_applications
  FOR SELECT TO authenticated
  USING (
    applicant_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      JOIN public.agent_job_postings ajp ON ajp.programme_id = pc.id
      WHERE ajp.id = agent_job_applications.posting_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','assessor','programme_manager')
    )
  );

CREATE POLICY "applications_insert_own" ON public.agent_job_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_user_id = auth.uid()
    AND status = 'submitted'
    AND decided_by IS NULL
    AND decision_reason IS NULL
    AND decision_rationale IS NULL
    AND EXISTS (
      SELECT 1 FROM public.agent_job_postings ajp
      WHERE ajp.id = agent_job_applications.posting_id
        AND ajp.status = 'published'
        AND (ajp.closes_at IS NULL OR ajp.closes_at > now())
    )
  );

CREATE POLICY "applications_update_hr" ON public.agent_job_applications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      JOIN public.agent_job_postings ajp ON ajp.programme_id = pc.id
      WHERE ajp.id = agent_job_applications.posting_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      JOIN public.agent_job_postings ajp ON ajp.programme_id = pc.id
      WHERE ajp.id = agent_job_applications.posting_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  );

-- candidate_assessments: HR sees/creates assessments for their programme
CREATE POLICY "assessments_select_hr" ON public.candidate_assessments
  FOR SELECT TO authenticated
  USING (
    assessed_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agent_job_applications aja
      JOIN public.agent_job_postings ajp ON ajp.id = aja.posting_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = ajp.programme_id
      )
      WHERE aja.id = candidate_assessments.application_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','assessor','programme_manager')
    )
  );

CREATE POLICY "assessments_insert_hr" ON public.candidate_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    assessed_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR EXISTS (
        SELECT 1 FROM public.agent_job_applications aja
        JOIN public.agent_job_postings ajp ON ajp.id = aja.posting_id
        JOIN public.programme_org_memberships pom ON pom.organization_id = (
          SELECT organization_id FROM public.programme_catalog WHERE id = ajp.programme_id
        )
        WHERE aja.id = candidate_assessments.application_id
          AND pom.user_id = auth.uid() AND pom.enabled = true
          AND pom.delegated_role IN ('org_admin','hr','recruiter','assessor','programme_manager')
      )
    )
  );

-- interview_slots: similar to assessments
CREATE POLICY "slots_select_hr_applicant" ON public.interview_slots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_job_applications aja
      WHERE aja.id = interview_slots.application_id
        AND aja.applicant_user_id = auth.uid()
    )
    OR interviewer_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agent_job_postings ajp
      JOIN public.programme_catalog pc ON pc.id = ajp.programme_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = pc.organization_id
      WHERE ajp.id = interview_slots.job_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  );

CREATE POLICY "slots_insert_hr" ON public.interview_slots
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR (
        interviewer_user_id = auth.uid()
        AND EXISTS (
        SELECT 1 FROM public.agent_job_postings ajp
        JOIN public.programme_catalog pc ON pc.id = ajp.programme_id
        JOIN public.programme_org_memberships pom ON pom.organization_id = pc.organization_id
        WHERE ajp.id = interview_slots.job_id
          AND pom.user_id = auth.uid() AND pom.enabled = true
          AND pom.delegated_role IN ('org_admin','hr','recruiter','assessor','programme_manager')
        )
      )
    )
    AND (
      application_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_job_applications aja
        WHERE aja.id = interview_slots.application_id
          AND aja.posting_id = interview_slots.job_id
      )
    )
  );

CREATE POLICY "slots_update_hr" ON public.interview_slots
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agent_job_postings ajp
      JOIN public.programme_catalog pc ON pc.id = ajp.programme_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = pc.organization_id
      WHERE ajp.id = interview_slots.job_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
    )
  )
  WITH CHECK (
    (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR EXISTS (
        SELECT 1 FROM public.agent_job_postings ajp
        JOIN public.programme_catalog pc ON pc.id = ajp.programme_id
        JOIN public.programme_org_memberships pom ON pom.organization_id = pc.organization_id
        WHERE ajp.id = interview_slots.job_id
          AND pom.user_id = auth.uid() AND pom.enabled = true
          AND pom.delegated_role IN ('org_admin','hr','recruiter','programme_manager')
      )
    )
    AND (
      application_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agent_job_applications aja
        WHERE aja.id = interview_slots.application_id
          AND aja.posting_id = interview_slots.job_id
      )
    )
  );

-- agent_contracts: org members and the contracted agent
CREATE POLICY "contracts_select" ON public.agent_contracts
  FOR SELECT TO authenticated
  USING (
    approved_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.agent_job_applications aja
      WHERE aja.id = agent_contracts.application_id
        AND aja.applicant_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      WHERE pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = agent_contracts.programme_id
      )
      AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "contracts_insert_hr" ON public.agent_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    approved_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR EXISTS (
        SELECT 1 FROM public.programme_org_memberships pom
        WHERE pom.organization_id = (
          SELECT organization_id FROM public.programme_catalog WHERE id = agent_contracts.programme_id
        )
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','hr','programme_manager')
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.agent_job_applications aja
      JOIN public.agent_job_postings ajp ON ajp.id = aja.posting_id
      WHERE aja.id = agent_contracts.application_id
        AND aja.status = 'offered'
        AND ajp.id = agent_contracts.job_id
        AND ajp.programme_id = agent_contracts.programme_id
    )
  );

-- Grant SELECT/INSERT/UPDATE back to authenticated on specific tables
GRANT SELECT, INSERT ON public.programme_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.programme_catalog TO authenticated;
GRANT SELECT, INSERT ON public.programme_org_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_job_postings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_job_applications TO authenticated;
GRANT SELECT, INSERT ON public.candidate_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.interview_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.agent_contracts TO authenticated;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_catalog_org_status
  ON public.programme_catalog (organization_id, status);

CREATE INDEX IF NOT EXISTS ix_posting_programme_status
  ON public.agent_job_postings (programme_id, status, closes_at);

CREATE INDEX IF NOT EXISTS ix_application_posting_status
  ON public.agent_job_applications (posting_id, status);

CREATE INDEX IF NOT EXISTS ix_application_applicant
  ON public.agent_job_applications (applicant_user_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS ix_interview_slots_job_time
  ON public.interview_slots (job_id, slot_start);

CREATE INDEX IF NOT EXISTS ix_assessment_application
  ON public.candidate_assessments (application_id, assessed_at DESC);

CREATE INDEX IF NOT EXISTS ix_contract_programme
  ON public.agent_contracts (programme_id, status);

CREATE INDEX IF NOT EXISTS ix_org_membership_user
  ON public.programme_org_memberships (user_id, enabled);

