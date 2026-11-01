/**
 * financeApi.js
 *
 * React Query hooks for the financial operations domain:
 *  - funding agreements & tranches
 *  - financial obligations (payment, salary)
 *  - payment instructions & status lifecycle
 *  - provider events
 *  - financial ledger (journals & entries)
 *  - government-facing aggregated totals
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

const db = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};
const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ── Funding agreements ────────────────────────────────────────────────────

export const useFundingAgreements = (programmeId) =>
  useQuery({
    queryKey: ["funding-agreements", programmeId],
    enabled: Boolean(programmeId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("funding_agreements")
          .select("*, funding_tranches(*)")
          .eq("programme_id", programmeId)
          .order("agreement_date", { ascending: false })
      ),
  });

export function useCreateFundingAgreement(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("funding_agreements")
          .insert({ ...fields, programme_id: programmeId, status: "active" })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funding-agreements", programmeId] });
    },
  });
}

export function useCreateTranche(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("funding_tranches")
          .insert({ ...fields, status: "pending" })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funding-agreements", programmeId] });
    },
  });
}

// ── Financial obligations ─────────────────────────────────────────────────

export const useFinancialObligations = (programmeId, { type, status } = {}) =>
  useQuery({
    queryKey: ["obligations", programmeId, type, status],
    enabled: Boolean(programmeId),
    staleTime: 30_000,
    queryFn: async () => {
      let q = db()
        .from("financial_obligations")
        .select("*, members(full_name, district, sector)")
        .eq("programme_id", programmeId)
        .order("due_date");
      if (type) q = q.eq("obligation_type", type);
      if (status) q = q.eq("status", status);
      return unwrap(await q);
    },
  });

export function useCreateObligation(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("financial_obligations")
          .insert({ ...fields, programme_id: programmeId, status: "planned" })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obligations", programmeId] });
    },
  });
}

export function useApproveObligation(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ obligationId, approvedBy }) =>
      unwrap(
        await db()
          .from("financial_obligations")
          .update({
            status: "approved",
            approved_by: approvedBy,
            approved_at: new Date().toISOString(),
          })
          .eq("id", obligationId)
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obligations", programmeId] });
    },
  });
}

// ── Payment instructions ──────────────────────────────────────────────────

export const usePaymentInstructions = (programmeId, { status } = {}) =>
  useQuery({
    queryKey: ["payment-instructions", programmeId, status],
    enabled: Boolean(programmeId),
    staleTime: 30_000,
    queryFn: async () => {
      let q = db()
        .from("payment_instructions")
        .select(
          `id, reference_code, instruction_date, value_date, total_amount, currency,
           batch_count, status, source_status, error_reason, reconciled_at,
           financial_obligations(member_id, obligation_type, members(full_name)),
           provider_events(event_type, event_at, provider_reference)`
        )
        .eq("programme_id", programmeId)
        .order("instruction_date", { ascending: false });
      if (status) q = q.eq("status", status);
      return unwrap(await q);
    },
  });

export function useCreatePaymentInstruction(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("payment_instructions")
          .insert({
            ...fields,
            programme_id: programmeId,
            status: "draft",
            source_status: "recorded",
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["payment-instructions", programmeId],
      });
    },
  });
}

/**
 * Advance a payment instruction through the workflow:
 * draft → submitted → processing → provider_pending → settled | failed | partially_settled
 */
export function useAdvancePaymentInstruction(programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ instructionId, status, source_status, error_reason }) =>
      unwrap(
        await db()
          .from("payment_instructions")
          .update({
            status,
            source_status: source_status || status,
            error_reason: error_reason || null,
            reconciled_at:
              status === "reconciled" ? new Date().toISOString() : null,
          })
          .eq("id", instructionId)
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["payment-instructions", programmeId],
      });
    },
  });
}

// ── Provider events ───────────────────────────────────────────────────────

export const useProviderEvents = (instructionId) =>
  useQuery({
    queryKey: ["provider-events", instructionId],
    enabled: Boolean(instructionId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("provider_events")
          .select("*")
          .eq("instruction_id", instructionId)
          .order("event_at")
      ),
  });

export function useRecordProviderEvent(instructionId, programmeId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("provider_events")
          .insert({ ...fields, instruction_id: instructionId })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["provider-events", instructionId] });
      qc.invalidateQueries({
        queryKey: ["payment-instructions", programmeId],
      });
    },
  });
}

// ── Ledger ────────────────────────────────────────────────────────────────

export const useLedgerJournals = (programmeId) =>
  useQuery({
    queryKey: ["ledger-journals", programmeId],
    enabled: Boolean(programmeId),
    staleTime: 60_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("financial_ledger_journals")
          .select("*, financial_ledger_entries(*)")
          .eq("programme_id", programmeId)
          .order("journal_date", { ascending: false })
          .limit(100)
      ),
  });

// ── Government financial summary (aggregated view) ────────────────────────

export const useGovFinanceSummary = ({ district, programmeId } = {}) =>
  useQuery({
    queryKey: ["gov-finance-summary", district, programmeId],
    staleTime: 120_000,
    queryFn: async () => {
      // Aggregate funding totals — filtered by programme if scoped
      let q = db()
        .from("funding_agreements")
        .select(
          "total_amount, currency, programme_id, programme_catalog(name, organization_id, programme_organizations(district))"
        )
        .eq("status", "active");
      if (programmeId) q = q.eq("programme_id", programmeId);
      const agreements = unwrap(await q);

      // Aggregate obligation totals
      let oq = db()
        .from("financial_obligations")
        .select("amount, currency, status, obligation_type, programme_id");
      if (programmeId) oq = oq.eq("programme_id", programmeId);
      const obligations = unwrap(await oq);

      // Aggregate payment instruction totals
      let pq = db()
        .from("payment_instructions")
        .select("total_amount, currency, status, programme_id");
      if (programmeId) pq = pq.eq("programme_id", programmeId);
      const payments = unwrap(await pq);

      return { agreements, obligations, payments };
    },
  });

// ── Cooperative financial entries ─────────────────────────────────────────

export const useCoopFinancialEntries = (coopId) =>
  useQuery({
    queryKey: ["coop-entries", coopId],
    enabled: Boolean(coopId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("cooperative_financial_entries")
          .select(
            "*, members(full_name), profiles!recorded_by(full_name)"
          )
          .eq("cooperative_id", coopId)
          .order("created_at", { ascending: false })
          .limit(100)
      ),
  });

export function useRecordCoopEntry(coopId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("cooperative_financial_entries")
          .insert({
            ...fields,
            cooperative_id: coopId,
            status: "pending",
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["coop-entries", coopId] });
    },
  });
}

// ── Financial diaries (member) ────────────────────────────────────────────

export const useMyFinancialDiary = (memberId) =>
  useQuery({
    queryKey: ["financial-diary", memberId],
    enabled: Boolean(memberId),
    staleTime: 30_000,
    queryFn: async () =>
      unwrap(
        await db()
          .from("financial_diaries")
          .select("*")
          .eq("member_id", memberId)
          .order("entry_date", { ascending: false })
          .limit(100)
      ),
  });

export function useAddDiaryEntry(memberId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields) =>
      unwrap(
        await db()
          .from("financial_diaries")
          .insert({
            ...fields,
            member_id: memberId,
            data_source: "self_reported",
          })
          .select()
          .single()
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-diary", memberId] });
    },
  });
}
