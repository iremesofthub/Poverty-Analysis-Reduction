/**
 * fieldApi.js
 *
 * React Query hooks for field operations:
 *  - programme enrollments
 *  - livelihood plans
 *  - training events
 *  - milestones
 *  - field evidence
 *  - supervisor verifications
 *  - outcome observations
 *  - financial access referrals (Phase 3)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { mapAgentVisit } from "@/lib/fieldVisitModel.mjs";

const db = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// The hosted project currently exposes visits with a member-scoped SELECT
// policy and an agent-scoped UPDATE policy. Keep this hook on that proven
// contract; richer journal fields require a separately reviewed migration.
export const useAgentVisits = (agentId) =>
  useQuery({
    queryKey: ["agent-visits", agentId],
    enabled: Boolean(agentId) && Boolean(supabase),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const today = new Date();
      const dayStart = new Date(today);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const rows = unwrap(
        await db()
          .from("visits")
          .select("id, assignment_id, member_id, agent_id, scheduled_at, purpose, status, checklist, members!visits_member_id_fkey(full_name, cell, district)")
          .eq("agent_id", agentId)
          .gte("scheduled_at", dayStart.toISOString())
          .lt("scheduled_at", dayEnd.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(100)
      );
      return rows.map(mapAgentVisit);
    },
  });

export const useAgentAssignmentCount = (agentId) =>
  useQuery({
    queryKey: ["agent-assignment-count", agentId],
    enabled: Boolean(agentId) && Boolean(supabase),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { count, error } = await db()
        .from("agent_assignments")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId)
        .eq("is_current", true);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

export function useCompleteAgentVisit(agentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ visitId }) =>
      unwrap(
        await db()
          .from("visits")
          .update({ status: "Done" })
          .eq("id", visitId)
          .eq("agent_id", agentId)
          .select("id, status, checklist")
          .single()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-visits", agentId] });
    },
  });
}

// ── Enrolments ────────────────────────────────────────────────────────────

export const useProgrammeEnrollments = (programmeId, { district, status } = {}) =>
  useQuery({
    queryKey: ["enrollments", programmeId, district, status],
    enabled: Boolean(programmeId),
    staleTime: 30_000,
    queryFn: async () => {
      let q = db()
        .from("programme_enrollments")
        .select(
          "id, status, enrolled_at, exit_reason, members(id, full_name, district, sector, cell)"
        )
        .eq("programme_id", programmeId)
        .order("enrolled_at", { ascending: false });
      if (district) q = q.eq("members.district", district);
      if (status) q = q.eq("status", status);
      return unwrap(await q);
    },
  });

export function useEnrollMember(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, agentId, notes }) =>
      unwrap(
        await db()
          .from("programme_enrollments")
          .insert({
            programme_id: programmeId,
            member_id: memberId,
            enrolled_by_agent: agentId,
            status: "active",
            notes,
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollments", programmeId] });
    },
  });
}

// ── Livelihood plans ──────────────────────────────────────────────────────

export const useLivelihoodPlans = (enrollmentId) =>
  useQuery({
    queryKey: ["livelihood-plans", enrollmentId],
    enabled: Boolean(enrollmentId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("livelihood_plans")
          .select("*, livelihood_plan_milestones(*)")
          .eq("enrollment_id", enrollmentId)
          .order("created_at", { ascending: false })
      ),
  });

export const useMemberLivelihoodPlans = (memberId) =>
  useQuery({
    queryKey: ["livelihood-plans-member", memberId],
    enabled: Boolean(memberId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("livelihood_plans")
          .select(
            `*, livelihood_plan_milestones(*),
             programme_enrollments!enrollment_id(programme_id, programme_catalog(name))`
          )
          .eq("member_id", memberId)
          .order("created_at", { ascending: false })
      ),
  });

export function useCreateLivelihoodPlan(enrollmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("livelihood_plans")
          .insert({ ...fields, enrollment_id: enrollmentId, plan_status: "draft" })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["livelihood-plans", enrollmentId] });
    },
  });
}

export function useUpdateLivelihoodPlan(enrollmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, ...fields }) =>
      unwrap(
        await db()
          .from("livelihood_plans")
          .update(fields)
          .eq("id", planId)
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["livelihood-plans", enrollmentId] });
    },
  });
}

// ── Training events ──────────────────────────────────────────────────────

export const useTrainingEvents = (planId) =>
  useQuery({
    queryKey: ["training-events", planId],
    enabled: Boolean(planId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("training_events")
          .select("*")
          .eq("plan_id", planId)
          .order("event_date", { ascending: false })
      ),
  });

export const useAgentTrainingEvents = (agentId) =>
  useQuery({
    queryKey: ["training-events-agent", agentId],
    enabled: Boolean(agentId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("training_events")
          .select(
            "*, livelihood_plans!plan_id(member_id, members(full_name))"
          )
          .eq("trainer_agent_id", agentId)
          .order("event_date", { ascending: false })
          .limit(50)
      ),
  });

export function useRecordTrainingEvent(planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("training_events")
          .insert({ ...fields, plan_id: planId })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-events", planId] });
    },
  });
}

// ── Milestones ────────────────────────────────────────────────────────────

export const useMilestones = (planId) =>
  useQuery({
    queryKey: ["milestones", planId],
    enabled: Boolean(planId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("livelihood_plan_milestones")
          .select("*, field_evidence(*), supervisor_verifications(*)")
          .eq("plan_id", planId)
          .order("due_date")
      ),
  });

export function useCreateMilestone(planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("livelihood_plan_milestones")
          .insert({ ...fields, plan_id: planId, completion_status: "not_started" })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", planId] });
    },
  });
}

export function useMarkMilestoneComplete(planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      completion_status,
      completion_notes,
      obstacles,
    }) =>
      unwrap(
        await db()
          .from("livelihood_plan_milestones")
          .update({
            completion_status,
            completion_notes,
            obstacles,
            completed_at:
              completion_status === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", milestoneId)
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", planId] });
    },
  });
}

// ── Field evidence ────────────────────────────────────────────────────────

export function useSubmitEvidence(milestoneId, planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("field_evidence")
          .insert({
            ...fields,
            milestone_id: milestoneId,
            member_consent_given: true,
            source_status: "pending_review",
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", planId] });
    },
  });
}

// ── Supervisor verification ────────────────────────────────────────────────

export function useRequestVerification(milestoneId, planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supervisorId, notes }) =>
      unwrap(
        await db()
          .from("supervisor_verifications")
          .insert({
            milestone_id: milestoneId,
            supervisor_id: supervisorId,
            verification_status: "requested",
            notes,
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", planId] });
    },
  });
}

export function useCompleteVerification(milestoneId, planId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      verificationId,
      verification_status,
      supervisor_notes,
      outcome_rating,
    }) =>
      unwrap(
        await db()
          .from("supervisor_verifications")
          .update({
            verification_status,
            supervisor_notes,
            outcome_rating,
            verified_at: new Date().toISOString(),
          })
          .eq("id", verificationId)
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestones", planId] });
    },
  });
}

// ── Outcome observations ──────────────────────────────────────────────────

export const useOutcomeObservations = (enrollmentId) =>
  useQuery({
    queryKey: ["outcomes", enrollmentId],
    enabled: Boolean(enrollmentId),
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("outcome_observations")
          .select("*")
          .eq("enrollment_id", enrollmentId)
          .order("observation_date", { ascending: false })
      ),
  });

export function useRecordOutcome(enrollmentId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("outcome_observations")
          .insert({
            ...fields,
            enrollment_id: enrollmentId,
            source_status: "recorded",
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outcomes", enrollmentId] });
    },
  });
}

// ── Financial access referrals ────────────────────────────────────────────

export const useFinancialReferrals = (memberId) =>
  useQuery({
    queryKey: ["financial-referrals", memberId],
    enabled: Boolean(memberId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("financial_access_referrals")
          .select("*")
          .eq("member_id", memberId)
          .order("created_at", { ascending: false })
      ),
  });

export function useCreateFinancialReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("financial_access_referrals")
          .insert({
            ...fields,
            status: "referred",
            member_consent_given: true,
            source_status: "recorded",
          })
          .select()
          .single()
      ),
    onSuccess: (_data, fields) => {
      qc.invalidateQueries({
        queryKey: ["financial-referrals", fields.member_id],
      });
    },
  });
}

export function useUpdateReferralStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      referralId,
      memberId,
      status,
      provider_confirmed_at,
      provider_reference,
    }) =>
      unwrap(
        await db()
          .from("financial_access_referrals")
          .update({
            status,
            provider_confirmed_at: provider_confirmed_at || null,
            provider_reference: provider_reference || null,
            source_status:
              status === "account_opened" || status === "product_issued"
                ? "provider_confirmed"
                : "recorded",
          })
          .eq("id", referralId)
          .select()
          .single()
      ),
    onSuccess: (_data, { memberId }) => {
      qc.invalidateQueries({ queryKey: ["financial-referrals", memberId] });
    },
  });
}
