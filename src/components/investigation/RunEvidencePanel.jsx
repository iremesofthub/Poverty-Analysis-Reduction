import React from "react";
import { AlertTriangle, CheckCircle2, FileClock, LockKeyhole, ShieldCheck } from "lucide-react";

// The evidence-quality read-out for one governed research run.
//
// Every value on this panel is a field the engine wrote into the run record - see src/lib/runEvidenceQuality.js
// for the derivation and the rules it enforces. The panel deliberately has no hand-written numbers: if a check
// did not run, it is named as not run, and if the record carries no human approval, the panel says that instead
// of showing a green tick.

const Row = ({ label, children, tone = "text-slate-700" }) => (
  <p className="mt-1.5 text-xs leading-5"><strong className="text-slate-900">{label}: </strong><span className={tone}>{children}</span></p>
);

const State = ({ tone, icon: Icon, children }) => (
  <div className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-5 ${tone}`}>
    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0">{children}</div>
  </div>
);

export default function RunEvidencePanel({ quality }) {
  if (!quality) return null;
  if (!quality.available) {
    return <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="run-evidence-quality" data-unavailable="true">
      <h3 className="text-sm font-semibold text-slate-900">Evidence quality</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-600">{quality.reason}</p>
    </section>;
  }
  const { releaseState, decision, certified, stages, integrity, recomputation, publishedComparison, sample, model, approvals, run } = quality;
  const blocked = stages.failed.length > 0 || stages.other.length > 0 || stages.missingOutputHash.length > 0;
  const attention = decision.outstanding || certified.count === 0 || !approvals.recorded;

  return <section className={`${quality.available ? "border-slate-200" : "border-dashed"} rounded-xl border bg-white p-5`} data-testid="run-evidence-quality" data-tour="run-evidence-quality">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Evidence quality</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">What this run does and does not prove</h3>
        <p className="mt-1 text-xs text-slate-500">Read from the run record itself{run?.id ? ` · ${run.id}` : ""}{run?.created ? `, created ${String(run.created).slice(0, 10)}` : ""}. Nothing on this panel is typed in.</p>
      </div>
      <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">{releaseState.label}</span>
    </div>

    <State tone={attention ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"} icon={attention ? AlertTriangle : ShieldCheck}>
      <p className="font-semibold">{decision.label}</p>
      {decision.reasons.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <p className="mt-1.5">{certified.note}</p>
      <p className="mt-1.5">{releaseState.note}</p>
    </State>

    <State tone={blocked ? "border-red-200 bg-red-50 text-red-950" : "border-slate-200 bg-slate-50 text-slate-800"} icon={blocked ? AlertTriangle : CheckCircle2}>
      <p className="font-semibold">Checks: {stages.note}</p>
      {stages.failed.length > 0 && <Row label="Failed" tone="font-medium text-red-800">{stages.failed.join(", ")}</Row>}
      {stages.other.length > 0 && <Row label="Neither completed nor failed">{stages.other.map((item) => `${item.stage} (${item.status})`).join(", ")}</Row>}
      {stages.missingOutputHash.length > 0 && <Row label="Completed but not re-derivable" tone="font-medium text-red-800">{stages.missingOutputHash.join(", ")}</Row>}
      {stages.total === 0 && <Row label="Recorded stages">{"none"}</Row>}
    </State>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-900">Independently recomputed</h4>
        {recomputation.attached ? <>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">{recomputation.compared} values across {recomputation.geographies.length} geographies ({recomputation.quantities.join(", ")}) estimated twice, in Python and in R, from the same authorized archive.</p>
          <Row label="Largest point difference">{recomputation.maxPointDifference === null ? "not recorded" : recomputation.maxPointDifference}</Row>
          <Row label="Largest standard-error difference">{recomputation.maxSeDifference === null ? "not recorded" : recomputation.maxSeDifference}</Row>
          {recomputation.ciMethods.length > 0 && <Row label="Interval methods compared">{recomputation.ciMethods.join("; ")}</Row>}
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{recomputation.note}</p>
        </> : <p className="mt-1.5 text-xs leading-5 text-slate-600">{recomputation.note}</p>}
      </article>

      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-900">Compared with published figures</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{publishedComparison.note}</p>
        <Row label="Sample size and reliability" tone="text-slate-600">{sample.note}</Row>
      </article>
    </div>

    <article className="mt-4 rounded-xl border border-slate-200 p-4" data-testid="run-provenance">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900"><FileClock className="h-3.5 w-3.5 text-emerald-800" />Evidence chain</h4>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">{integrity.recorded} of {integrity.total} provenance hashes recorded for this run.</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
        {[["Dataset snapshot", integrity.datasetSha256], ["Indicator registry", integrity.indicatorRegistrySha256], ["Science environment", integrity.environmentSha256], ["Code commit", integrity.codeCommit]].map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-2">
            <dt className="text-slate-500">{label}</dt>
            <dd className={value ? "break-all font-mono text-slate-800" : "font-medium text-red-800"}>{value ? `${value.slice(0, 16)}${value.length > 16 ? "…" : ""}` : "not recorded"}</dd>
          </div>
        ))}
      </dl>
      <Row label="Workflow version">{integrity.workflowVersion || "not recorded"}</Row>
      {!integrity.commitIsFullHash && integrity.codeCommit && <p className="mt-1 text-[11px] leading-5 text-amber-900">The commit is recorded as a short reference, which cannot be checked for substitution the way a full hash can.</p>}
    </article>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-900">Model status</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{model.note}</p>
        {model.reviewOutstanding && <p className="mt-1 text-[11px] font-medium text-amber-900">Evaluation review outstanding.</p>}
      </article>
      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900"><LockKeyhole className="h-3.5 w-3.5 text-emerald-800" />Human approvals</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{approvals.note}</p>
        <Row label="Unresolved review points">{decision.unresolved}</Row>
        {publishedComparison.attached === false && <p className="mt-1 text-[11px] leading-5 text-slate-500">Verified matches against official tables: this run record carries none, so none is shown.</p>}
      </article>
    </div>

    <p className="mt-4 text-[11px] leading-5 text-slate-500">Restricted drafts may be read, reviewed and corrected. They are not official NISR outputs, and the numbers on this panel do not become one by being displayed here.</p>
  </section>;
}

// The release-state read-out for the report response the governed API just returned. Same rule as the run
// panel: every line is a field from that response, and a field the response does not carry is named as absent
// rather than assumed. This is the view where a human decision is recorded, so it must not imply a decision
// that the server did not return.
export function ReportReleasePanel({ quality }) {
  if (!quality) return null;
  if (!quality.available) {
    return <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="report-release-quality" data-unavailable="true">
      <h3 className="text-sm font-semibold text-slate-900">Release state of the last report response</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-600">{quality.reason}</p>
    </section>;
  }
  const { releaseState, identity, hash, decision, approvals, verification, bytes } = quality;
  const released = releaseState.token === "published";

  return <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="report-release-quality" data-tour="report-release-quality">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Release state</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">What the governed API answered</h3>
        <p className="mt-1 text-xs text-slate-500">Read from the server response only{identity?.reportId ? ` · ${identity.reportId}` : ""}{identity?.version ? ` · version ${identity.version}` : ""}.</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold text-white ${released ? "bg-emerald-900" : "bg-slate-900"}`}>{releaseState.label}</span>
    </div>

    <State tone={released ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"} icon={released ? ShieldCheck : AlertTriangle}>
      <p className="font-semibold">{releaseState.label}</p>
      <p className="mt-1.5">{releaseState.note}</p>
    </State>

    <State tone={decision.recorded && decision.outstanding ? "border-amber-200 bg-slate-50 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-800"} icon={decision.recorded ? FileClock : AlertTriangle}>
      <p className="font-semibold">Review decision</p>
      <p className="mt-1.5">{decision.recorded ? `The engine returned decision status "${decision.token || "not stated"}". ${decision.note}` : decision.note}</p>
      {decision.reasons.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-4">{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <Row label="Snapshot the decision binds to" tone={hash.complete ? "break-all font-mono text-slate-700" : "font-medium text-red-800"}>{hash.value || "not returned"}</Row>
      <p className="mt-1.5">{hash.note}</p>
    </State>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900"><LockKeyhole className="h-3.5 w-3.5 text-emerald-800" />Who approved</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{approvals.note}</p>
      </article>
      <article className="rounded-xl border border-slate-200 p-4">
        <h4 className="text-xs font-semibold text-slate-900">Evidence behind the report</h4>
        <p className="mt-1.5 text-xs leading-5 text-slate-600">{verification.note}</p>
      </article>
    </div>

    <p className="mt-4 text-[11px] leading-5 text-slate-500">{bytes.note}</p>
  </section>;
}
