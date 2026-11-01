import React, { useState } from "react";
import { Plus, Loader2, AlertCircle, Info } from "lucide-react";
import Card from "@/components/analyst/Card";
import { useProgrammeScope } from "@/lib/programmeScope";
import { useMe } from "@/lib/memberApi";
import {
  usePaymentInstructions,
  useCreatePaymentInstruction,
  useAdvancePaymentInstruction,
  useCreateObligation,
} from "@/lib/financeApi";
import { supabase } from "@/lib/supabaseClient";

// ── Status display helpers ────────────────────────────────────────────────
const PI_STATUS_STYLE = {
  draft: "border-hairline bg-[#FAFBFD] text-[#8A94A6]",
  submitted: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  processing: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  provider_pending: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  settled: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  reconciled: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  partially_settled: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  failed: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
  cancelled: "border-hairline bg-[#FAFBFD] text-[#8A94A6]",
};
const PI_STATUS_LABEL = {
  draft: "Draft", submitted: "Submitted", processing: "Processing",
  provider_pending: "Provider pending", settled: "Settled", reconciled: "Reconciled",
  partially_settled: "Partially settled", failed: "Failed", cancelled: "Cancelled",
};
const SOURCE_STYLE = {
  demo: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  recorded: "border-hairline text-sub",
  pending_review: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  verified: "border-[#D3CEFF] bg-[#EFEDFF] text-[#4B3FCC]",
  provider_confirmed: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  disputed: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
};
const fmt = (n) => (n != null ? Number(n).toLocaleString() : "—");
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-RW") : "—");

// Legacy demo payment status style (for backwards compat)
const demoStatusStyle = (s) =>
  s === "Delivered" ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" :
  s === "Pending" ? "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]" :
  "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]";

// ── Create obligation + instruction modal ─────────────────────────────────
function ObligationModal({ programmeId, memberId, onClose }) {
  const [obligationType, setObligationType] = useState("member_support");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState("mobile_money");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState(null);
  const [step, setStep] = useState("form"); // form | confirming | done

  const createObligation = useCreateObligation(programmeId);
  const createInstruction = useCreatePaymentInstruction(programmeId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!amount || Number(amount) <= 0) return setErr("Enter a valid amount.");
    if (!dueDate) return setErr("Due date is required.");
    setStep("confirming");
    try {
      // 1. Create a financial obligation
      const obligation = await createObligation.mutateAsync({
        member_id: memberId || null,
        obligation_type: obligationType,
        amount: Number(amount),
        currency: "RWF",
        due_date: dueDate,
        description: description.trim() || null,
      });

      // 2. Create a payment instruction referencing the obligation
      await createInstruction.mutateAsync({
        obligation_id: obligation.id,
        instruction_date: new Date().toISOString().slice(0, 10),
        total_amount: Number(amount),
        currency: "RWF",
        batch_count: 1,
        payment_channel: channel,
        reference_code: `PI-${Date.now().toString(36).toUpperCase()}`,
      });

      setStep("done");
      setTimeout(onClose, 1500);
    } catch (e) {
      setErr(e.message);
      setStep("form");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-ink">Record payment obligation</h3>
        <p className="mt-0.5 text-[11.5px] text-sub">
          Creates a planned obligation and a draft payment instruction. No money is moved until the instruction is submitted and provider-confirmed.
        </p>

        {step === "done" && (
          <div className="mt-3 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-3 py-2 text-[12px] text-[#067647]">
            Obligation and draft payment instruction recorded.
          </div>
        )}
        {err && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-sub">Obligation type</label>
            <select value={obligationType} onChange={(e) => setObligationType(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
              <option value="member_support">Member support payment</option>
              <option value="agent_salary">Agent salary</option>
              <option value="supplier_payment">Supplier payment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-sub">Amount (RWF) *</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="12500" className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-sub">Due date *</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-sub">Payment channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand">
              <option value="mobile_money">Mobile Money</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-sub">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. October 2026 support payment" className="w-full rounded-md border border-hairline px-3 py-2 text-[12.5px] outline-none focus:border-brand" />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[10.5px] text-[#B54708]">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            This creates a draft instruction. No payment is made until it is submitted for processing and confirmed by the provider.
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-hairline px-3 py-1.5 text-[12px] text-sub hover:bg-canvas">Cancel</button>
            <button
              type="submit"
              disabled={step !== "form" || createObligation.isPending || createInstruction.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-1.5 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-60"
            >
              {(createObligation.isPending || createInstruction.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Record obligation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function PaymentsTab() {
  const { payments: DEMO_PAYMENTS, beneficiaries: DEMO_BENEFICIARIES } = useProgrammeScope();
  const meQuery = useMe();
  const [showCreate, setShowCreate] = useState(false);

  // Real programme ID from Supabase profile
  const programmeId = meQuery.data?.profile?.programme_id ?? null;
  const hasLive = Boolean(supabase) && Boolean(programmeId);

  const piQuery = usePaymentInstructions(hasLive ? programmeId : null);
  const instructions = piQuery.data ?? [];
  const advanceMut = useAdvancePaymentInstruction(programmeId);

  // Computed KPIs from live instructions
  const settled = instructions.filter((i) => ["settled", "reconciled"].includes(i.status))
    .reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const failedCount = instructions.filter((i) => i.status === "failed").length;
  const pendingCount = instructions.filter((i) => ["draft", "submitted", "processing", "provider_pending"].includes(i.status)).length;

  // Demo KPIs
  const demoTotal = DEMO_PAYMENTS.reduce((s, p) => s + (p.status === "Delivered" ? p.amount : 0), 0);
  const demoFailed = DEMO_PAYMENTS.filter((p) => p.status === "Failed").length;
  const demoPending = DEMO_PAYMENTS.filter((p) => p.status === "Pending").length;

  const handleAdvance = async (instruction) => {
    // Move draft → submitted as a simple one-click progression
    const next = { draft: "submitted", submitted: "processing" }[instruction.status];
    if (!next) return;
    try {
      await advanceMut.mutateAsync({
        instructionId: instruction.id,
        status: next,
        source_status: "pending_review",
      });
    } catch { /* errors surfaced by query */ }
  };

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3" data-tour="payments-kpis">
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="text-[11px] text-[#8A94A6]">{hasLive ? "Settled / Reconciled" : "Settled / Reconciled (sample records)"}</p>
          <p className="mt-1 text-[20px] font-semibold text-ink tabular-nums">
            RWF {hasLive ? fmt(settled) : demoTotal.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="text-[11px] text-[#8A94A6]">Failed</p>
          <p className="mt-1 text-[20px] font-semibold text-[#B42318] tabular-nums">
            {hasLive ? failedCount : demoFailed}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
          <p className="text-[11px] text-[#8A94A6]">In progress</p>
          <p className="mt-1 text-[20px] font-semibold text-[#B54708] tabular-nums">
            {hasLive ? pendingCount : demoPending}
          </p>
        </div>
      </div>

      {/* A pending instruction is never final, and a demonstration total is never a settlement: only provider
          evidence moves a payment to settled, so the sample figures say so where they are shown. */}
      {!hasLive && (
        <p className="-mt-1 text-[10.5px] leading-relaxed text-[#B54708]">
          No payment provider is connected to this account, so the three figures above come from sample programme records.
          They are not provider-confirmed settlements and must not be reported as money that reached anyone.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Create obligation panel */}
        <Card title="Record obligation" subtitle="Plan a payment" className="lg:col-span-1">
          <div className="space-y-3">
            <p className="text-[11.5px] leading-relaxed text-sub">
              Record a planned financial obligation (member support, agent salary, supplier). A draft payment instruction is created but <strong>no money is moved</strong> until submitted and provider-confirmed.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              data-tour="payments-record-obligation"
              disabled={!hasLive}
              title={!hasLive ? "Sign in to record live obligations" : undefined}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Record obligation
            </button>
            {!hasLive && (
              <p className="text-[10.5px] text-[#8A94A6]">Connect a Supabase programme account to record live obligations.</p>
            )}
          </div>
        </Card>

        {/* Payment instruction history */}
        <Card
          title={hasLive ? "Payment instructions" : "Payment history"}
          subtitle={hasLive ? "Live from database" : "Demo data"}
          className="lg:col-span-2"
          bodyClassName="px-0 pb-0"
        >
          {piQuery.isLoading && (
            <div className="flex items-center gap-2 py-6 px-5 text-[12px] text-sub">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {piQuery.isError && (
            <div className="flex items-center gap-2 py-4 px-5 text-[11.5px] text-[#B42318]">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {piQuery.error?.message}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[12px]" data-tour="payments-history">
              <thead>
                <tr className="border-y border-hairline bg-[#FAFBFD] text-[10px] uppercase tracking-[0.06em] text-[#8A94A6]">
                  {hasLive ? (
                    <>
                      <th className="py-2 pl-5 pr-3 text-left font-medium">Reference</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Source</th>
                      <th className="py-2 pl-3 pr-3 text-right font-medium">Status</th>
                      <th className="py-2 pl-2 pr-5 text-right font-medium">Action</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 pl-5 pr-3 text-left font-medium">ID</th>
                      <th className="px-3 py-2 text-left font-medium">Program Member</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 text-left font-medium">Channel</th>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="py-2 pl-3 pr-5 text-right font-medium">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {hasLive
                  ? instructions.map((inst) => (
                      <tr key={inst.id} className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]">
                        <td className="py-2 pl-5 pr-3 font-mono text-[10.5px] text-sub">{inst.reference_code ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">
                          {inst.currency ?? "RWF"} {fmt(inst.total_amount)}
                        </td>
                        <td className="px-3 py-2 text-sub">{fmtDate(inst.instruction_date)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium ${SOURCE_STYLE[inst.source_status] ?? "border-hairline text-sub"}`}>
                            {inst.source_status ?? "—"}
                          </span>
                        </td>
                        <td className="py-2 pl-3 pr-3 text-right">
                          <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${PI_STATUS_STYLE[inst.status] ?? "border-hairline text-sub"}`}>
                            {PI_STATUS_LABEL[inst.status] ?? inst.status}
                          </span>
                        </td>
                        <td className="py-2 pl-2 pr-5 text-right">
                          {["draft", "submitted"].includes(inst.status) && (
                            <button
                              onClick={() => handleAdvance(inst)}
                              disabled={advanceMut.isPending}
                              className="rounded border border-hairline px-2 py-[2px] text-[10.5px] text-ink hover:bg-canvas disabled:opacity-50"
                            >
                              {inst.status === "draft" ? "Submit" : "Mark processing"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  : DEMO_PAYMENTS.map((p) => (
                      <tr key={p.id} className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]">
                        <td className="py-2 pl-5 pr-3 font-medium text-sub">{p.id}</td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{p.beneficiary}</p>
                          <p className="text-[10px] text-sub">{p.district}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-ink">RWF {p.amount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-sub">{p.channel}</td>
                        <td className="px-3 py-2 text-sub">{p.date}</td>
                        <td className="py-2 pl-3 pr-5 text-right">
                          <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${demoStatusStyle(p.status)}`}>{p.status}</span>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
            {hasLive && instructions.length === 0 && !piQuery.isLoading && !piQuery.isError && (
              <div className="py-6 px-5 text-center text-[12px] text-sub">No payment instructions recorded yet.</div>
            )}
          </div>
        </Card>
      </div>

      {showCreate && (
        <ObligationModal
          programmeId={programmeId}
          memberId={null}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
