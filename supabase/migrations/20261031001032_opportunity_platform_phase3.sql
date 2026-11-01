-- Phase 3: Financial Inclusion, Funding Agreements & Payment Tracking
-- ADDITIVE ONLY

-- ============================================================
-- Financial access referrals (bank/mobile money onboarding)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_access_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id),
  programme_id uuid REFERENCES public.programme_catalog(id),
  referral_type text NOT NULL
    CHECK (referral_type IN ('bank_account','mobile_money','credit_information','savings_group')),
  provider_name text,
  -- Never store account numbers, PINs or passwords
  masked_reference text, -- e.g. last 4 digits reference only
  consent_recorded_at timestamptz,
  consent_withdrawn_at timestamptz,
  referred_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested','consented','submitted','provider_confirmed',
                      'rejected','withdrawn','unavailable','pending_integration')),
  status_note text,
  -- Explicit: not confirmed by provider unless status = 'provider_confirmed'
  provider_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Funding agreements (external funding sources for programmes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funding_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  source_name text NOT NULL CHECK (length(trim(source_name)) > 1),
  source_organization text,
  funding_type text NOT NULL
    CHECK (funding_type IN ('grant','investment','loan','government_allocation','donor','other')),
  currency text NOT NULL DEFAULT 'RWF' CHECK (currency ~ '^[A-Z]{3}$'),
  agreed_amount numeric(18,2) NOT NULL CHECK (agreed_amount >= 0),
  restrictions text,
  agreement_date date,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','signed','active','closed','cancelled','suspended')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Funding tranches (scheduled installments)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.funding_tranches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.funding_agreements(id),
  tranche_number integer NOT NULL CHECK (tranche_number > 0),
  expected_date date NOT NULL,
  currency text NOT NULL DEFAULT 'RWF',
  expected_amount numeric(18,2) NOT NULL CHECK (expected_amount > 0),
  received_amount numeric(18,2) DEFAULT 0 CHECK (received_amount >= 0),
  received_date date,
  status text NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected','received','partial','delayed','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_id, tranche_number)
);

-- ============================================================
-- Programme financial obligations (what is owed to whom)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.programme_financial_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  obligation_kind text NOT NULL
    CHECK (obligation_kind IN ('member_support','agent_wage','training','materials','operating_cost')),
  recipient_member_id uuid REFERENCES public.members(id),
  recipient_agent_id uuid REFERENCES public.agents(id),
  period_label text, -- e.g. "October 2026"
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'RWF' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','payable','cancelled')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  due_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Constraint: member_support needs a member, agent_wage needs an agent
  CHECK (
    (obligation_kind = 'member_support' AND recipient_member_id IS NOT NULL AND recipient_agent_id IS NULL)
    OR (obligation_kind = 'agent_wage' AND recipient_agent_id IS NOT NULL AND recipient_member_id IS NULL)
    OR (obligation_kind IN ('training','materials','operating_cost'))
  )
);

-- ============================================================
-- Payment instructions (the actual payment request to provider)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.programme_financial_obligations(id),
  -- Idempotency: one payment per obligation+period+provider request
  client_idempotency_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  provider_code text, -- 'mtn_momo', 'bank_transfer', 'manual', etc.
  provider_reference text,
  -- Payment status: must reflect actual provider state
  state text NOT NULL DEFAULT 'created'
    CHECK (state IN ('created','submitted','acknowledged','settled','failed','reversed','disputed')),
  created_by uuid REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  settled_at timestamptz,
  failure_reason text,
  -- Prevent claiming settlement without provider event
  -- settled_at can only be set via provider_events trigger (enforced in application layer)
  UNIQUE (provider_code, provider_reference)
);

-- ============================================================
-- Provider events (webhook callbacks from payment provider)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_instruction_id uuid NOT NULL REFERENCES public.payment_instructions(id),
  provider_code text NOT NULL,
  provider_event_id text NOT NULL,
  provider_event_type text NOT NULL
    CHECK (provider_event_type IN ('payment.initiated','payment.success','payment.failed',
                                    'payment.reversed','payment.pending','other')),
  event_time timestamptz,
  -- Must be verified before trusting settlement
  verified_signature boolean NOT NULL DEFAULT false,
  raw_payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_code, provider_event_id)
);

-- ============================================================
-- Financial ledger (double-entry for programme accounting)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_ledger_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id uuid NOT NULL REFERENCES public.programme_catalog(id),
  reference_type text NOT NULL
    CHECK (reference_type IN ('funding_tranche','obligation','payment','refund','adjustment')),
  reference_id uuid,
  description text,
  currency text NOT NULL DEFAULT 'RWF' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','reversed')),
  posted_by uuid REFERENCES auth.users(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.financial_ledger_journals(id),
  account_code text NOT NULL,
  account_name text,
  side text NOT NULL CHECK (side IN ('debit','credit')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Enable RLS
-- ============================================================

ALTER TABLE public.financial_access_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_tranches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_financial_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_ledger_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.financial_access_referrals FROM anon, authenticated;
REVOKE ALL ON public.funding_agreements FROM anon, authenticated;
REVOKE ALL ON public.funding_tranches FROM anon, authenticated;
REVOKE ALL ON public.programme_financial_obligations FROM anon, authenticated;
REVOKE ALL ON public.payment_instructions FROM anon, authenticated;
REVOKE ALL ON public.provider_events FROM anon, authenticated;
REVOKE ALL ON public.financial_ledger_journals FROM anon, authenticated;
REVOKE ALL ON public.financial_ledger_entries FROM anon, authenticated;

-- ============================================================
-- RLS Policies — Financial Access Referrals
-- ============================================================

-- Members see their own referrals; assigned agents see them; programme staff see all
CREATE POLICY "referral_select" ON public.financial_access_referrals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR referred_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.member_id = financial_access_referrals.member_id)
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = financial_access_referrals.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Agent with this member assigned
    EXISTS (
      SELECT 1 FROM public.agent_assignments aa
      WHERE aa.member_id = financial_access_referrals.member_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  );

CREATE POLICY "referral_insert" ON public.financial_access_referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    referred_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                AND role IN ('platform_admin','field_agent','programme_owner'))
  );

CREATE POLICY "referral_update" ON public.financial_access_referrals
  FOR UPDATE TO authenticated
  USING (
    referred_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = financial_access_referrals.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  )
  WITH CHECK (true);

-- ============================================================
-- RLS Policies — Funding Agreements
-- ============================================================

-- Programme org members; government auditors; platform_admin
CREATE POLICY "funding_select" ON public.funding_agreements
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = funding_agreements.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Government district officers can see funding in their district
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.programme_catalog pc ON pc.id = funding_agreements.programme_id
      WHERE p.id = auth.uid() AND p.role IN ('gov_district','gov_sector')
        AND (pc.district_code IS NULL OR pc.district_code = p.district)
    )
  );

CREATE POLICY "funding_insert" ON public.funding_agreements
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = funding_agreements.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','financial_reviewer','paymaster')
    )
  );

CREATE POLICY "funding_update" ON public.funding_agreements
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = funding_agreements.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','financial_reviewer')
    )
  )
  WITH CHECK (true);

-- funding_tranches
CREATE POLICY "tranche_select" ON public.funding_tranches
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.funding_agreements fa
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = fa.programme_id
      )
      WHERE fa.id = funding_tranches.agreement_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "tranche_insert" ON public.funding_tranches
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.funding_agreements fa
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = fa.programme_id
      )
      WHERE fa.id = funding_tranches.agreement_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','financial_reviewer','paymaster')
    )
  );

-- programme_financial_obligations
CREATE POLICY "obligation_select" ON public.programme_financial_obligations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_financial_obligations.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
    OR -- Member can see their own obligation
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
            AND p.member_id = programme_financial_obligations.recipient_member_id)
    OR -- Agent can see their own wage obligation
    EXISTS (
      SELECT 1 FROM public.agents ag
      WHERE ag.id = programme_financial_obligations.recipient_agent_id
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'field_agent')
    )
  );

CREATE POLICY "obligation_insert" ON public.programme_financial_obligations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_financial_obligations.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','paymaster','financial_reviewer')
    )
  );

CREATE POLICY "obligation_update" ON public.programme_financial_obligations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = programme_financial_obligations.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
        AND pom.delegated_role IN ('org_admin','programme_manager','paymaster','financial_reviewer')
    )
  )
  WITH CHECK (true);

-- payment_instructions
CREATE POLICY "payment_select" ON public.payment_instructions
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_financial_obligations pfo
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pfo.programme_id
      )
      WHERE pfo.id = payment_instructions.obligation_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "payment_insert" ON public.payment_instructions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
      OR EXISTS (
        SELECT 1 FROM public.programme_financial_obligations pfo
        JOIN public.programme_org_memberships pom ON pom.organization_id = (
          SELECT organization_id FROM public.programme_catalog WHERE id = pfo.programme_id
        )
        WHERE pfo.id = payment_instructions.obligation_id
          AND pom.user_id = auth.uid() AND pom.enabled = true
          AND pom.delegated_role IN ('org_admin','paymaster','financial_reviewer')
      )
    )
  );

-- provider_events: write-only from edge function (service role); read by org members
CREATE POLICY "events_select" ON public.provider_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.payment_instructions pi
      JOIN public.programme_financial_obligations pfo ON pfo.id = pi.obligation_id
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = pfo.programme_id
      )
      WHERE pi.id = provider_events.payment_instruction_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

-- Ledger: org members + platform_admin
CREATE POLICY "journal_select" ON public.financial_ledger_journals
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.programme_org_memberships pom
      JOIN public.programme_catalog pc ON pc.organization_id = pom.organization_id
      WHERE pc.id = financial_ledger_journals.programme_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

CREATE POLICY "entry_select" ON public.financial_ledger_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'platform_admin')
    OR EXISTS (
      SELECT 1 FROM public.financial_ledger_journals flj
      JOIN public.programme_org_memberships pom ON pom.organization_id = (
        SELECT organization_id FROM public.programme_catalog WHERE id = flj.programme_id
      )
      WHERE flj.id = financial_ledger_entries.journal_id
        AND pom.user_id = auth.uid() AND pom.enabled = true
    )
  );

-- ============================================================
-- Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.financial_access_referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.funding_agreements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.funding_tranches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.programme_financial_obligations TO authenticated;
GRANT SELECT, INSERT ON public.payment_instructions TO authenticated;
GRANT SELECT ON public.provider_events TO authenticated;
GRANT SELECT ON public.financial_ledger_journals TO authenticated;
GRANT SELECT ON public.financial_ledger_entries TO authenticated;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_referral_member
  ON public.financial_access_referrals (member_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_referral_programme
  ON public.financial_access_referrals (programme_id, status);

CREATE INDEX IF NOT EXISTS ix_funding_programme_status
  ON public.funding_agreements (programme_id, status);

CREATE INDEX IF NOT EXISTS ix_obligation_programme_kind
  ON public.programme_financial_obligations (programme_id, obligation_kind, status);

CREATE INDEX IF NOT EXISTS ix_obligation_member
  ON public.programme_financial_obligations (recipient_member_id, status);

CREATE INDEX IF NOT EXISTS ix_obligation_agent
  ON public.programme_financial_obligations (recipient_agent_id, status);

CREATE INDEX IF NOT EXISTS ix_payment_obligation
  ON public.payment_instructions (obligation_id, state, requested_at DESC);

CREATE INDEX IF NOT EXISTS ix_event_instruction
  ON public.provider_events (payment_instruction_id, received_at DESC);

CREATE INDEX IF NOT EXISTS ix_journal_programme
  ON public.financial_ledger_journals (programme_id, status, posted_at DESC);
