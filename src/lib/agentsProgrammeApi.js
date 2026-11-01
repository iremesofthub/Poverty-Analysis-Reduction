/**
 * agentsProgrammeApi.js
 *
 * React Query hooks for agents and programme members/beneficiaries.
 * Tables: agent_contracts (joined with profiles), programme_enrollments (joined with members)
 *
 * All hooks gracefully fall back when Supabase is not configured:
 *   - queries return { data: [], isDemo: true } via the onError path
 *   - mutations are no-ops that resolve immediately
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Safe check: returns true only when Supabase is actually configured */
export const isSupa = () => Boolean(supabase && supabase.from);

const db = () => {
  if (!isSupa()) throw new Error("Supabase is not configured.");
  return supabase;
};

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ── Agent employees ──────────────────────────────────────────────────────────

/**
 * useAgentEmployees(programmeId)
 *
 * Queries the agent_contracts table joined with profiles.
 * Returns an array of agent employee records.
 * Falls back to [] with isDemo:true when Supabase is unavailable.
 */
export const useAgentEmployees = (programmeId) =>
  useQuery({
    queryKey: ["agent-employees", programmeId],
    enabled: Boolean(programmeId) && isSupa(),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const rows = unwrap(
        await db()
          .from("agent_contracts")
          .select(
            `id, status, employment_type, wage_amount, wage_currency, wage_frequency,
             skills_taught, assigned_members_count, contract_start, contract_end,
             profiles!agent_user_id(id, full_name, phone, district, sector)`
          )
          .eq("programme_id", programmeId)
          .order("contract_start", { ascending: false })
      );
      // Flatten nested profiles join for easier consumption by UI
      return rows.map((row) => ({
        id: row.id,
        full_name: row.profiles?.full_name ?? "—",
        phone: row.profiles?.phone ?? "—",
        district: row.profiles?.district ?? "—",
        sector: row.profiles?.sector ?? "—",
        employment_type: row.employment_type,
        wage_amount: row.wage_amount,
        wage_currency: row.wage_currency ?? "RWF",
        wage_frequency: row.wage_frequency,
        status: row.status,
        skills_taught: row.skills_taught ?? [],
        assigned_members_count: row.assigned_members_count ?? 0,
        contract_start: row.contract_start,
        contract_end: row.contract_end,
      }));
    },
    // On error (including "not configured"), return empty list with demo flag
    placeholderData: { isDemo: true, data: [] },
  });

// ── Programme members / beneficiaries ────────────────────────────────────────

/**
 * useProgrammeMembers(programmeId, { district, status })
 *
 * Queries programme_enrollments joined with members.
 * Returns an array of member/enrollment records.
 * Falls back to [] with isDemo:true when Supabase is unavailable.
 */
export const useProgrammeMembers = (programmeId, { district, status } = {}) =>
  useQuery({
    queryKey: ["programme-members", programmeId, district, status],
    enabled: Boolean(programmeId) && isSupa(),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      let q = db()
        .from("programme_enrollments")
        .select(
          `id, status, enrolled_at, exit_reason,
           members!member_id(id, full_name, district, sector, cell, family_size, health_status)`
        )
        .eq("programme_id", programmeId)
        .order("enrolled_at", { ascending: false });

      if (district) q = q.eq("members.district", district);
      if (status) q = q.eq("status", status);

      const rows = unwrap(await q);
      // Flatten nested members join for easier consumption by UI
      return rows.map((row) => ({
        id: row.id,
        member_id: row.members?.id,
        full_name: row.members?.full_name ?? "—",
        district: row.members?.district ?? "—",
        sector: row.members?.sector ?? "—",
        cell: row.members?.cell ?? "—",
        family_size: row.members?.family_size ?? 0,
        health_status: row.members?.health_status ?? "—",
        status: row.status,
        enrolled_at: row.enrolled_at,
        exit_reason: row.exit_reason,
      }));
    },
    // On error, return empty list with demo flag
    placeholderData: { isDemo: true, data: [] },
  });

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * useCreateAgentEmployee(programmeId)
 *
 * Inserts a new record into agent_contracts.
 * When Supabase is not configured the mutationFn resolves as a no-op.
 */
export function useCreateAgentEmployee(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) => {
      if (!isSupa()) {
        // Demo mode: no-op
        return null;
      }
      return unwrap(
        await db()
          .from("agent_contracts")
          .insert({
            ...fields,
            programme_id: programmeId,
            status: "draft",
          })
          .select()
          .single()
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-employees", programmeId] });
    },
  });
}

/**
 * useUpdateMemberStatus(programmeId)
 *
 * Updates the status field of a programme_enrollments row.
 * When Supabase is not configured the mutationFn resolves as a no-op.
 */
export function useUpdateMemberStatus(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ enrollmentId, status }) => {
      if (!isSupa()) {
        // Demo mode: no-op
        return null;
      }
      return unwrap(
        await db()
          .from("programme_enrollments")
          .update({ status })
          .eq("id", enrollmentId)
          .select()
          .single()
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programme-members", programmeId] });
    },
  });
}
