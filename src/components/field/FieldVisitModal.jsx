import React, { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const field = "mt-1 w-full rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";
const labelClass = "block text-[11.5px] font-medium text-ink";
const VISIT_TYPES = ["Payment verification", "Enrolment", "Complaint follow-up", "Home visit", "Follow-up check", "Training", "Other"];

/**
 * In live mode this form writes only fields supported by the connected visits
 * table. The local demo keeps the original free-text form, clearly separated.
 */
export default function FieldVisitModal({ open, onOpenChange, visit, onRecord, persisted = false }) {
  const [visitType, setVisitType] = useState("");
  const [notes, setNotes] = useState("");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVisitType(visit?.type || VISIT_TYPES[0]);
    setNotes("");
    setOutcomeSummary("");
    setError("");
    setSuccess(false);
    setLoading(false);
  }, [open, visit]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (onRecord) {
        await onRecord(persisted
          ? { visitId: visit?.id ?? null }
          : { visitId: visit?.id ?? null, visitType, notes: notes.trim(), outcomeSummary: outcomeSummary.trim() });
      }
      setSuccess(true);
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <ClipboardList className="h-4 w-4 text-brand" strokeWidth={1.9} />
            {persisted ? "Complete assigned visit" : "Record field visit"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {visit?.name
              ? `Completing a visit for ${visit.name} · ${visit.cell}`
              : persisted ? "Only an existing visit assigned to your account can be updated." : "Fill in the details and mark the visit complete."}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex items-start gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-3 text-[12.5px] text-[#067647]">
            <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
            {persisted
              ? "Visit status saved. Narrative notes and outcome summaries are not available in this database yet."
              : "Visit recorded. Your supervisor will see it in real time."}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {visit?.name && (
              <div>
                <p className={labelClass}>Program member</p>
                <p className="mt-1 rounded-md border border-hairline bg-canvas/60 px-3 py-2 text-[12.5px] text-ink">
                  {visit.name}{visit.cell ? <span className="ml-2 text-sub">· {visit.cell}</span> : null}
                </p>
              </div>
            )}

            {persisted ? (
              <>
                <div>
                  <p className={labelClass}>Visit type</p>
                  <p className="mt-1 rounded-md border border-hairline bg-canvas/60 px-3 py-2 text-[12.5px] text-ink">{visit?.type ?? "Scheduled visit"}</p>
                </div>
                <p className="rounded-md border border-hairline bg-canvas/60 px-3 py-2 text-[11px] leading-relaxed text-sub">
                  The connected database stores visit status only. Narrative notes, checklist edits, and outcome summaries need a reviewed schema update.
                </p>
              </>
            ) : (
              <>
                <label className={labelClass}>
                  Visit type
                  <select value={visitType} onChange={(event) => setVisitType(event.target.value)} className={field} required>
                    {VISIT_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className={labelClass}>
                  Notes
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={600} placeholder="What did you observe or discuss?" className={`${field} resize-y`} />
                </label>
                <label className={labelClass}>
                  Outcome summary
                  <textarea value={outcomeSummary} onChange={(event) => setOutcomeSummary(event.target.value)} rows={2} maxLength={300} placeholder="Key outcome or next step (optional)" className={`${field} resize-y`} />
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11.5px] text-red-700">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />{error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-md border border-hairline px-3 py-2 text-[12px] font-medium text-ink hover:bg-canvas disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={loading || (persisted && !visit?.id)} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[12px] font-medium text-white hover:bg-brand/90 disabled:opacity-60">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {loading ? "Saving…" : "Mark complete"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
