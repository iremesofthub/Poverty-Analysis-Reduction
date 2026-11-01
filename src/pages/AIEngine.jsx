import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowLeft, BookOpenCheck,
  BrainCircuit, Check, ChevronRight, CircleHelp, Database, FileCheck2, Fingerprint,
  GitBranch, LoaderCircle, LockKeyhole, Network, Plus, RefreshCw, Send, ShieldCheck,
  Sparkles,
} from "lucide-react";
import { requestGoverned } from "@/lib/iremeApi";
import { describeApiFailure, describeFailures, failureNotice } from "@/lib/apiFailure";
import { reportReleaseQuality, runEvidenceQuality } from "@/lib/runEvidenceQuality";
import RunEvidencePanel, { ReportReleasePanel } from "@/components/investigation/RunEvidencePanel";
import DistrictSurveyEvidence from "@/components/investigation/DistrictSurveyEvidence";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";

// A failed call is reported as the kind of failure it was, so a reader never mistakes an outage, a missing
// record or a refused permission for a figure that failed verification. See src/lib/apiFailure.js.
const failedNotice = (error, what) => ({ kind: "error", text: failureNotice(error, what).text });

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "evidence", label: "Evidence & lineage", icon: Network },
  { id: "hypotheses", label: "Hypotheses", icon: BookOpenCheck },
  { id: "agents", label: "AI research", icon: BrainCircuit },
  { id: "reports", label: "Reports & review", icon: FileCheck2 },
  { id: "access", label: "Access & audit", icon: ShieldCheck },
];

const panel = "rounded-2xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.035)]";const field = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50";

const GOVERNED_API_CONFIGURED = Boolean(import.meta.env.VITE_IREME_API_URL);

function Notice({ kind = "info", children }) {
  const styles = kind === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return <div role={kind === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-xl border p-3 text-sm leading-6 ${styles}`}><AlertCircle className="mt-1 h-4 w-4 shrink-0" />{children}</div>;
}

function EmptyPanel({ icon: Icon, title, children }) {
  return <div className={`${panel} px-6 py-12 text-center`}><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{children}</p></div>;
}

function Overview({ investigation, runId, district, setRunId, setDistrict, onLoad, onStart, onResume, permissionId, setPermissionId, indicatorKey, setIndicatorKey, catalog, onReloadCatalog, onLoadRun, job, busy, lineage, hypotheses, onSection }) {
  const cards = [
    { title: "Run status", value: investigation?.status || job?.status || "Not connected", note: investigation ? "Read from the governed run record" : job ? "Worker state from the governed jobs store" : "Pick a run from the list or start a new one", icon: Activity },
    { title: "Scientific decision", value: investigation?.scientific_decision || "Pending run", note: investigation?.reasons?.[0] || "No decision is inferred before the API responds", icon: ShieldCheck },
    { title: "Certified facts", value: investigation ? investigation.certified_fact_ids?.length ?? 0 : "—", note: "Only server-certified facts can be shown", icon: Database },
    { title: "Lineage links", value: lineage?.edges?.length ?? "—", note: lineage ? "Authorized source relationships" : "Load a run to retrieve lineage", icon: GitBranch },
  ];
  const permissions = catalog?.permissions || [];
  const indicators = catalog?.indicators || [];
  const activePermissions = permissions.filter((item) => item.active);
  const selectedPermission = activePermissions.find((item) => item.permission_id === permissionId) || activePermissions[0] || null;
  const purpose = selectedPermission?.purposes?.includes("research") ? "research" : selectedPermission?.purposes?.[0] || "";
  const runs = catalog?.runs || [];
  const submitting = Boolean(job && ["queued", "running"].includes(job.status));
  const start = (event) => {
    event.preventDefault();
    if (!selectedPermission || !indicatorKey) return;
    const [indicator_id, definition_version] = indicatorKey.split("::");
    onStart({ permission: selectedPermission, purpose, indicator_id, definition_version });
  };
  return <div className="space-y-6">
    <section className={`${panel} overflow-hidden`}>
      <div className="grid gap-7 p-6 md:grid-cols-[1fr_0.9fr] md:p-8">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900"><Sparkles className="h-3.5 w-3.5" /> Ireme Insight · governed research</span>
          <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-slate-950">Research poverty with traceable evidence.</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Inspect a permitted research run, follow its source lineage, record competing explanations, and send bounded AI research tasks for human review.</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-full border border-slate-200 px-2.5 py-1">Signed-in session · governed API</span><span className="rounded-full border border-slate-200 px-2.5 py-1">Server-enforced scope</span><span className="rounded-full border border-slate-200 px-2.5 py-1">No sample figures</span></div>
        </div>
        <div data-tour="inv-form" className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm"><Activity className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-slate-900">Your recent runs</h3><p className="mt-0.5 text-xs leading-5 text-slate-600">Loaded from <code className="rounded bg-white px-1 font-mono text-[10px]">GET /v1/investigations</code> — no ID to copy.</p></div></div>
            <button type="button" onClick={onReloadCatalog} disabled={catalog?.loading} aria-label="Reload recent runs" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${catalog?.loading ? "animate-spin" : ""}`} /></button>
          </div>
          {catalog?.error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">{catalog.error}</p>}
          {runs.length > 0 && <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">{runs.map((run) => <li key={run.investigation_id}><button type="button" onClick={() => onLoadRun(run.investigation_id)} className={`w-full rounded-lg border bg-white p-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40 ${run.investigation_id === runId ? "border-emerald-500 ring-1 ring-emerald-100" : "border-slate-200"}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[11px] text-slate-800">{run.investigation_id}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold capitalize text-slate-700">{run.status}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{run.indicator_id || "Indicator"} · {run.dataset_id || "dataset"} v{run.dataset_version || "?"}{run.owned ? "" : " · shared"}</p></button></li>)}</ul>}
          {!runs.length && !catalog?.loading && !catalog?.error && <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-[11px] leading-5 text-slate-600">No runs yet. Start the EICV7 analysis below and it appears here automatically.</p>}
          {catalog?.loading && !runs.length && <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-[11px] leading-5 text-slate-600">Loading your runs…</p>}
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
            <label className="block text-[11px] font-semibold text-slate-700" htmlFor="run-id">Open a run by ID</label>
            <div className="mt-1.5 flex gap-2"><input id="run-id" className={`${field} mt-0 flex-1`} autoComplete="off" value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="run-…" /><button className={secondary} type="button" disabled={busy || !runId.trim()} onClick={onLoad}>Open</button></div>
            <label className="mt-2 block text-[11px] font-medium text-slate-600" htmlFor="run-district">Geography in this run</label>
            <input id="run-district" className={`${field} mt-1`} autoComplete="off" value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="Rwanda or an authorized district" />
          </div>
        </div>
      </div>
    </section>
    {!investigation && <section className={`${panel} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Start supported analysis</p><h3 className="mt-1 text-lg font-semibold text-slate-950">EICV7 poverty headcount</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Runs the registered Python estimator and independent R survey reference against the authorized EICV7 archive. The result remains a restricted draft pending scientific review.</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedPermission ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{selectedPermission ? "Permission on file" : "No active permission"}</span>
      </div>
      {catalog?.error && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">{catalog.error} <button type="button" onClick={onReloadCatalog} className="font-semibold underline">Retry</button></p>}
      <form onSubmit={start} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-slate-700" htmlFor="permission-select">Dataset permission
          <select id="permission-select" className={field} value={selectedPermission?.permission_id || ""} onChange={(event) => setPermissionId(event.target.value)} disabled={!activePermissions.length}>
            {activePermissions.length > 0 ? activePermissions.map((item) => <option key={item.permission_id} value={item.permission_id}>{item.dataset_id} v{item.dataset_version} · {item.purposes.join(", ")}</option>) : <option value="">None recorded for your tenant</option>}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700" htmlFor="indicator-select">Indicator definition
          <select id="indicator-select" className={field} value={indicatorKey} onChange={(event) => setIndicatorKey(event.target.value)} disabled={!indicators.length}>
            {indicators.length > 0 ? indicators.map((item) => <option key={`${item.indicator_id}::${item.definition_version}`} value={`${item.indicator_id}::${item.definition_version}`}>{item.indicator_id} · definition v{item.definition_version}{item.unit ? ` · ${item.unit}` : ""}</option>) : <option value="">No indicator registered</option>}
          </select>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
          <p className="max-w-xl text-xs leading-5 text-slate-500">The API re-checks the selected permission, dataset hash, indicator definition and purpose before queueing. Purpose <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">{purpose || "—"}</code> comes from the permission record.</p>
          <button type="submit" className={primary} disabled={busy || !selectedPermission || !indicatorKey || submitting}>{busy || submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Start EICV7 analysis</button>
        </div>
      </form>
    </section>}
    {job && !investigation && <section className={`${panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Worker status</p><h3 className="mt-1 font-mono text-sm text-slate-900">{job.investigation_id || job.run_id}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-800">{job.status}</span>{job.status === "failed" && <button type="button" onClick={onResume} disabled={busy} className={secondary}><RefreshCw className="h-4 w-4"/>Resume from checkpoint</button>}</div><ol className="mt-4 grid gap-2 sm:grid-cols-3">{(job.stages || []).map((stage) => <li key={stage.stage_id || stage.name} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><span className="font-medium text-slate-800">{stage.stage_id || stage.name}</span><span className="ml-2 capitalize text-slate-500">{stage.status}</span></li>)}</ol></section>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ title, value, note, icon: Icon }) => <article key={title} className={`${panel} p-4`}><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-600">{title}</span><Icon className="h-4 w-4 text-emerald-800" /></div><p className="mt-3 truncate text-lg font-semibold capitalize text-slate-950">{value}</p><p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-slate-500">{note}</p></article>)}</div>
    {investigation && <section data-tour="inv-history" className={`${panel} p-5 sm:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Current investigation</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{investigation.district || district}</h3><p className="mt-1 font-mono text-xs text-slate-500">{investigation.investigation_id}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-900">{investigation.status}</span></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Scientific decision</p><p className="mt-1 text-sm font-semibold capitalize text-slate-900">{investigation.scientific_decision || "Not stated"}</p>{investigation.reasons?.length > 0 && <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-slate-600">{investigation.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>}</div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">Run manifest</p><p className="mt-1 break-all font-mono text-xs leading-5 text-slate-700">{JSON.stringify(investigation.manifest || {}, null, 2)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{[{ id: "evidence", title: "View evidence lineage", icon: Network }, { id: "hypotheses", title: `${hypotheses?.history?.length ? "Review" : "Create"} hypotheses`, icon: BookOpenCheck }].map(({ id, title, icon: Icon }) => <button key={id} type="button" onClick={() => onSection(id)} className={secondary}><Icon className="h-4 w-4 text-emerald-800" />{title}<ChevronRight className="h-3.5 w-3.5" /></button>)}</div></section>}
    <FeatureMiniEntry className="bg-white" anchor="engine-overview-quality" ids={["evidence-check", "quality-checks", "model-evaluation"]} titleKey="discover.mini.evidenceQuality" />
    <DistrictSurveyEvidence district={investigation?.district || district} />
    {!investigation && <EmptyPanel icon={LockKeyhole} title="Pick a run or start a new one">Recent runs are listed above from the governed API. The engine verifies your role, district, dataset permission, and run ownership before returning any record.</EmptyPanel>}
  </div>;
}


function EvidencePage({ investigation, lineage, busy, onRefresh }) {
  if (!investigation) return <EmptyPanel icon={Network} title="Evidence appears with a connected run">Lineage is read from the governed catalog. The interface does not substitute dashboard totals or sample records for investigation evidence.</EmptyPanel>;
  const quality = runEvidenceQuality(investigation);
  return <div className="space-y-5"><section className={`${panel} p-5 sm:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Evidence graph</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Source lineage</h2><p className="mt-1 text-sm text-slate-600">Authorized upstream records linked to this research run.</p></div><button type="button" className={secondary} onClick={onRefresh} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh</button></div><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-emerald-900 px-3 py-2 text-xs font-semibold text-white">Investigation · {investigation.investigation_id}</span><ArrowLeft className="h-4 w-4 rotate-180 text-slate-400" /><span className="text-sm font-medium text-slate-700">{lineage?.edges?.length ?? 0} upstream links</span></div></div>{lineage?.edges?.length ? <div className="mt-4 space-y-2">{lineage.edges.map((edge, index) => <article key={`${edge.parent?.entity || edge.parent}-${edge.child?.entity || edge.child}-${index}`} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /><div className="min-w-0"><p className="break-all text-sm font-medium text-slate-900">{edge.parent?.kind || edge.kind || "Source record"} · {edge.parent?.entity || edge.entity || "Lineage item"}</p><p className="mt-1 break-all font-mono text-[11px] leading-5 text-slate-500">{JSON.stringify(edge)}</p></div></article>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">The governed API returned no lineage edges for this run.</p>}</section><RunEvidencePanel quality={quality} /><Notice>Raw estimates are intentionally not rendered as certified facts unless the engine’s independent science gate has certified them.</Notice></div>;
}

function HypothesesPage({ investigation, ledger, busy, onRefresh, onSave }) {
  const [question, setQuestion] = useState(ledger?.history?.at(-1)?.snapshot?.document?.question || "");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [plan, setPlan] = useState("");
  const [notTestedReason, setNotTestedReason] = useState("");
  useEffect(() => { setQuestion(ledger?.history?.at(-1)?.snapshot?.document?.question || ""); }, [ledger]);
  if (!investigation) return <EmptyPanel icon={BookOpenCheck} title="Open a run to use the hypothesis ledger">Hypotheses are versioned against a specific investigation and geography. Competing explanations remain visible in the immutable revision history.</EmptyPanel>;
  const latest = ledger?.history?.at(-1)?.snapshot;
  const save = (event) => {
    event.preventDefault();
    const offset = latest?.document?.hypotheses?.length || 0;
    const proposed = [first, second].map((statement, index) => ({ hypothesis_id: `h${offset + index + 1}`, statement, direction: "unspecified", competing_ids: [`h${offset + (index === 0 ? 2 : 1)}`], test_plan: plan, status: "open", evidence_for: [], evidence_against: [], tests_run: [], adjusted_inference: "untested", causal_identification_status: "not_established", identification_study: null, confidence_category: "unknown", data_gaps: [], reasons_not_tested: [notTestedReason], next_evidence_request: [] }));
    onSave({ base_version: latest?.version || 0, document: { question, hypotheses: [...(latest?.document?.hypotheses || []), ...proposed], stop_reason: null } });
  };
  return <div className="space-y-5"><section className={`${panel} p-5 sm:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Research ledger</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Competing explanations</h2><p className="mt-1 text-sm text-slate-600">Record what could explain an observed pattern and how to test it.</p></div><button type="button" onClick={onRefresh} className={secondary} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />Refresh history</button></div>
      {latest?.document?.hypotheses?.length > 0 && <div className="mt-5 space-y-3">{latest.document.hypotheses.map((hypothesis) => <article key={hypothesis.hypothesis_id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs text-slate-500">{hypothesis.hypothesis_id}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium capitalize text-amber-900">{hypothesis.status} · confidence {hypothesis.confidence_category}</span></div><p className="mt-2 text-sm font-medium leading-6 text-slate-900">{hypothesis.statement}</p><p className="mt-2 text-xs leading-5 text-slate-600"><strong>Test plan:</strong> {hypothesis.test_plan}</p></article>)}</div>}
      <form onSubmit={save} className="mt-5 border-t border-slate-100 pt-5"><h3 className="text-sm font-semibold text-slate-900">{latest ? "Add a ledger revision" : "Create the first ledger revision"}</h3><p className="mt-1 text-xs leading-5 text-slate-500">The API requires at least two competing hypotheses. Existing hypotheses are carried forward unchanged in each immutable revision.</p><label className="mt-4 block text-xs font-medium text-slate-700" htmlFor="research-question">Research question</label><input id="research-question" className={field} value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={2000} placeholder="What explains the observed difference?"/><div className="mt-3 grid gap-3 md:grid-cols-2">{[[first, setFirst, "Hypothesis A"], [second, setSecond, "Competing hypothesis B"]].map(([value, setter, title]) => <label key={title} className="block text-xs font-medium text-slate-700">{title}<textarea className={`${field} min-h-24 resize-y`} value={value} onChange={(event) => setter(event.target.value)} required maxLength={2000} placeholder="Describe a plausible explanation" /></label>)}</div><label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="test-plan">Shared test plan</label><textarea id="test-plan" className={`${field} min-h-20 resize-y`} value={plan} onChange={(event) => setPlan(event.target.value)} required maxLength={2000} placeholder="Describe evidence and methods that could distinguish the explanations"/><label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="not-tested">Why has this not been tested yet?</label><input id="not-tested" className={field} value={notTestedReason} onChange={(event) => setNotTestedReason(event.target.value)} required maxLength={2000} placeholder="For example: the necessary district sample data is not yet authorized"/><button type="submit" disabled={busy} className={`${primary} mt-4`}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save immutable revision</button></form>
      {ledger?.history?.length > 0 && <details className="mt-5 rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-medium text-slate-800">Revision history ({ledger.history.length})</summary><ol className="mt-3 space-y-2">{ledger.history.map(({ snapshot, sha256 }) => <li key={sha256} className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-800">Revision {snapshot.version}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">SHA-256 · {sha256}</p></li>)}</ol></details>}
    </section><Notice>Saving a hypothesis does not test it, certify a statistic, establish causality, or approve publication.</Notice></div>;
}

function AgentsPage({ investigation, busy, proposals, onRun }) {
  const [role, setRole] = useState("skeptical_reviewer");
  const [question, setQuestion] = useState("");
  if (!investigation) return <div className="space-y-5"><EmptyPanel icon={BrainCircuit} title="AI research needs an authorized run">A bounded agent task only receives policy-filtered aggregate context from a run you are allowed to inspect.</EmptyPanel>
    {/* This screen is where the "Understand the model" entry leads, so it carries the model's own position: no
        trained, validated targeting model exists in this build, and none is scored or applied to a household. */}
    <FeatureMiniEntry className="bg-white" anchor="model-evaluation-destination" titleKey="discover.mini.evidenceQuality" ids={["model-evaluation"]} /></div>;
  return <div className="space-y-5"><section className={`${panel} p-5 sm:p-6`}><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Bounded AI assistance</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Ask an AI research role</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">The agent can propose questions and critiques. Its output is untrusted until an analyst checks it against the source evidence.</p></div><form onSubmit={(event) => { event.preventDefault(); onRun({ role, question, max_steps: 6, max_repairs: 2 }); }} className="mt-5"><label htmlFor="agent-role" className="block text-xs font-medium text-slate-700">Research role</label><select id="agent-role" className={field} value={role} onChange={(event) => setRole(event.target.value)}>{[["investigation_planner", "Investigation planner"], ["skeptical_reviewer", "Skeptical reviewer"], ["causal_researcher", "Causal researcher"], ["statistical_interpreter", "Statistical interpreter"], ["report_planner", "Report planner"], ["source_researcher", "Source researcher"], ["semantic_mapper", "Semantic mapper"], ["intervention_analyst", "Intervention analyst"], ["translation_assistant", "Translation assistant"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="agent-question">Research task</label><textarea id="agent-question" className={`${field} min-h-28 resize-y`} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={4000} required placeholder="Ask for a bounded critique grounded in the investigation evidence"/><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Budget: up to 6 steps and 2 repairs. Provider and disclosure policy are checked server-side.</p><button className={primary} type="submit" disabled={busy || !question.trim()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Request proposals</button></div></form></section>{proposals && <section className={`${panel} p-5 sm:p-6`}><div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-emerald-800"/><h3 className="text-sm font-semibold text-slate-900">Agent output · requires human review</h3></div><pre className="mt-4 max-h-[34rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-emerald-50">{JSON.stringify(proposals, null, 2)}</pre></section>}<Notice kind="info">The API returns proposals only. It cannot append to the immutable ledger, certify facts, make eligibility decisions, or approve a report.</Notice></div>;
}

function ReportsPage({ busy, reportRecord, onReview, onPublish, onExport }) {
  const [reportId, setReportId] = useState("");
  const [version, setVersion] = useState("");
  const [sha256, setSha256] = useState("");
  const [decision, setDecision] = useState("approve");
  const [reason, setReason] = useState("");
  const release = reportReleaseQuality(reportRecord);
  return <div data-judge="reports" className="space-y-5"><section className={`${panel} p-5 sm:p-6`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Human release gate</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Review a frozen report version</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Review decisions bind to the exact report hash. The backend checks your role, MFA assurance, author separation, and required review roles. Which demo freedoms are switched on is a server state, read from <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">/v1/admin/bypass/status</code> and listed on the Access tab; this form assumes none of them.</p><div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-xs font-medium text-slate-700">Report ID<input className={field} value={reportId} onChange={(event) => setReportId(event.target.value)} placeholder="Existing report ID" /></label><label className="text-xs font-medium text-slate-700">Report version<input className={field} value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Frozen version" /></label><label className="text-xs font-medium text-slate-700 md:col-span-2">Reviewed AST SHA-256<input className={`${field} font-mono`} value={sha256} onChange={(event) => setSha256(event.target.value)} minLength={64} maxLength={64} placeholder="64-character hash from the report snapshot" /></label><label className="text-xs font-medium text-slate-700">Decision<select className={field} value={decision} onChange={(event) => setDecision(event.target.value)}><option value="approve">Approve this version</option><option value="reject">Reject this version</option></select></label><label className="text-xs font-medium text-slate-700">Review reason<textarea className={`${field} min-h-[42px] resize-y`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} placeholder="What did you verify?" /></label></div><div className="mt-4 flex flex-wrap gap-2"><button className={primary} type="button" disabled={busy || !reportId || !version || !/^[a-f0-9]{64}$/.test(sha256)} onClick={() => onReview({ reportId, body: { version, decision, report_ast_sha256: sha256, reason } })}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit review</button><button className={secondary} type="button" disabled={busy || !reportId || !version} onClick={() => onPublish({ reportId, version })}><FileCheck2 className="h-4 w-4" />Publish approved version</button><button className={secondary} type="button" disabled={busy || !reportId || !version} onClick={() => onExport({ reportId, version, format: "pdf" })}><ArrowDownToLine className="h-4 w-4" />Download released PDF</button></div><p className="mt-3 text-xs leading-5 text-slate-500">The API deliberately has no report-list or report-detail route yet. You need an existing report ID and exact frozen version from the authorized report workflow.</p></section><ReportReleasePanel quality={release} />{reportRecord && <section className={`${panel} p-5`}><h3 className="text-sm font-semibold text-slate-900">Latest server response</h3><pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-5 text-emerald-50">{JSON.stringify(reportRecord, null, 2)}</pre></section>}<Notice>Approvals are server recorded signatures. This interface never fabricates a signature or changes release status on its own.</Notice></div>;
}

const DEMO_CONTROLS = [
  { key: "bypass_human_approvals", title: "Human approval chain", text: "The analyst who wrote the report can record the review signature and publish it. Report safety checks still run." },
  { key: "bypass_independent_statistician", title: "Independent statistician sign-off", text: "Removes the second-statistician requirement that otherwise blocks a demo release." },
  { key: "bypass_production_infra", title: "Production infrastructure gates", text: "Treats missing hosted identity, durable storage and managed-worker evidence as demo gaps rather than blockers." },
  { key: "bypass_verification_gates", title: "Verification gates", text: "The completion script records unmet gates in the bypass ledger instead of exiting non-zero." },
];

const API_SURFACE = [
  { method: "GET", path: "/v1/investigations", note: "Recent runs the signed-in principal may see" },
  { method: "POST", path: "/v1/investigations", note: "Queue an authorized EICV7 poverty estimate" },
  { method: "GET", path: "/v1/permissions", note: "Dataset permissions on file, with validity state" },
  { method: "GET", path: "/v1/indicators", note: "Registered indicator definitions" },
  { method: "GET", path: "/v1/jobs/{run_id}", note: "Worker progress for a queued run" },
  { method: "POST", path: "/v1/investigations/{id}/resume", note: "Resume from the last checkpoint" },
  { method: "GET", path: "/v1/investigations/{id}", note: "Run record, scientific decision, manifest" },
  { method: "GET", path: "/v1/investigations/{id}/facts", note: "Server-certified facts only" },
  { method: "GET", path: "/v1/investigations/{id}/lineage", note: "Upstream evidence links" },
  { method: "GET · POST", path: "/v1/investigations/{id}/hypotheses", note: "Versioned hypothesis ledger" },
  { method: "POST", path: "/v1/investigations/{id}/agent-proposals", note: "Bounded AI research task" },
  { method: "POST", path: "/v1/reports/{id}/review", note: "Record a human release decision" },
  { method: "POST", path: "/v1/reports/{id}/publish", note: "Publish an approved version" },
  { method: "GET", path: "/v1/reports/{id}/export", note: "Download the released artefact" },
  { method: "GET", path: "/v1/admin/bypass/status", note: "Demo bypass ledger (read by any signed-in user)" },
  { method: "POST", path: "/v1/admin/bypass/toggle", note: "Flip a demo bypass (platform_admin only)" },
  { method: "GET", path: "/v1/admin/mfa/status", note: "MFA state for the running profile" },
  { method: "POST", path: "/v1/admin/mfa/toggle", note: "Toggle demo MFA (platform_admin only)" },
];

function Toggle({ checked, onChange, label, busy }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={busy} onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-emerald-700" : "bg-slate-300"}`}><span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? "translate-x-6" : "translate-x-1"}`} /></button>;
}

function AccessPage() {
  const [demo, setDemo] = useState({ loading: true, profile: null, bypass: null, mfa: null, error: null });
  const [busyKey, setBusyKey] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setDemo((current) => ({ ...current, loading: true, error: null }));
    const [bypassResult, mfaResult] = await Promise.allSettled([
      requestGoverned("/v1/admin/bypass/status"),
      requestGoverned("/v1/admin/mfa/status"),
    ]);
    const bypass = bypassResult.status === "fulfilled" ? bypassResult.value : null;
    const mfa = mfaResult.status === "fulfilled" ? mfaResult.value : null;
    if (!bypass && !mfa) {
      // Tagged so the panel below never files "the service answered with nothing" as "the service was unreachable".
      setDemo({ loading: false, profile: null, bypass: null, mfa: null, error: (bypassResult.status === "rejected" && bypassResult.reason) || { kind: "rejected", message: "The service answered but returned no demo control state." } });
      return;
    }
    setDemo({ loading: false, profile: bypass?.profile || mfa?.profile || null, bypass: bypass?.bypass || null, mfa, error: null });
  }, []);

  useEffect(() => { load(); }, [load]);

  const flipBypass = async (key, label, enabled) => {
    setBusyKey(key); setNotice(null);
    try {
      const result = await requestGoverned("/v1/admin/bypass/toggle", { method: "POST", body: { [key]: enabled } });
      setDemo((current) => ({ ...current, bypass: result.bypass || current.bypass }));
      setNotice({ kind: "success", text: `${label} turned ${enabled ? "on" : "off"} for this demo session.` });
    } catch (error) { setNotice(failedNotice(error, "demo gate setting")); }
    finally { setBusyKey(null); }
  };

  const flipMfa = async (enabled) => {
    setBusyKey("mfa"); setNotice(null);
    try {
      const result = await requestGoverned("/v1/admin/mfa/toggle", { method: "POST", body: { enabled } });
      setDemo((current) => ({ ...current, mfa: { ...current.mfa, mfa_enabled: typeof result.mfa_enabled === "boolean" ? result.mfa_enabled : enabled } }));
      setNotice({ kind: "success", text: `Multi-factor requirement turned ${enabled ? "on" : "off"} for this demo session.` });
    } catch (error) { setNotice(failedNotice(error, "multi-factor setting")); }
    finally { setBusyKey(null); }
  };

  // A strict release profile hides this state on purpose and answers 403. That is a different fact from "no
  // such route", "the service is down" or "nothing is configured here", and each needs its own sentence.
  const demoFailure = describeApiFailure(demo.error, "demo control state");
  const demoHint = ["unreachable", "service_error", "not_configured"].includes(demoFailure.kind)
    ? " Start the API or check VITE_IREME_API_URL, then reload."
    : "";

  return <div className="space-y-5">
    <section className={`${panel} p-5 sm:p-6`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Identity & authorization</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Permission checks happen in the engine</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Each request is authenticated by the governed API — bearer token when a Supabase session exists, demo principal otherwise. The API verifies role, district, dataset permission, and run ownership before responding.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{[{ title: "Signed-in session", text: "The browser forwards a short-lived access token; it never uses a service-role key.", icon: Fingerprint }, { title: "Dataset permission", text: "The engine checks the current permission record for the exact dataset, version, and purpose.", icon: LockKeyhole }, { title: "Audit trail", text: "Governed reads and research writes are journalled by the API with trace IDs.", icon: GitBranch }, { title: "NISR access paperwork", text: "An access agreement or approval must be recorded through the organization’s process before restricted source permissions are granted.", icon: FileCheck2 }].map(({ title, text, icon: Icon }) => <article key={title} className="rounded-xl border border-slate-200 p-4"><Icon className="h-4 w-4 text-emerald-800" /><h3 className="mt-2 text-sm font-semibold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{text}</p></article>)}</div>
    </section>

    <section className={`${panel} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Demo controls</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">Gates currently bypassed</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Read from <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">/v1/admin/bypass/status</code>. Changes apply to this running API only, are never persisted, and disappear on restart.</p>
        </div>
        <div className="flex items-center gap-2">{demo.profile && <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{demo.profile}</span>}<button type="button" className={secondary} onClick={load} disabled={demo.loading}><RefreshCw className={`h-4 w-4 ${demo.loading ? "animate-spin" : ""}`} />Reload</button></div>
      </div>
      {demo.loading && <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">Reading demo state from the governed API…</p>}
      {!demo.loading && demo.error && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" /><div><h3 className="text-sm font-semibold text-amber-950">{demo.error?.status === 403 ? "Demo controls are not exposed" : `Demo controls: ${demoFailure.label.toLowerCase()}`}</h3><p className="mt-1 text-sm leading-6 text-amber-900">{demo.error?.status === 403 ? "This API is running a strict release profile, so it discloses no bypass state. That is the expected behaviour for GOVERNED_PRODUCTION." : `${demoFailure.sentence}${demoHint}`}</p><p className="mt-1 break-all font-mono text-[11px] text-amber-800">{demo.error?.message || "Demo controls are unavailable."}</p></div></div></div>}
      {!demo.loading && demo.bypass && <ul className="mt-5 divide-y divide-slate-100">{DEMO_CONTROLS.map(({ key, title, text }) => <li key={key} className="flex items-start justify-between gap-4 py-4"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-600">{text}</p>{key in demo.bypass ? null : <p className="mt-1 text-xs font-medium text-rose-700">This API does not expose this toggle.</p>}<p className="mt-1 font-mono text-[10px] text-slate-400">{key}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><Toggle checked={Boolean(demo.bypass[key])} busy={busyKey === key} onChange={(next) => flipBypass(key, title, next)} label={title} /><span className={`text-[11px] font-semibold ${demo.bypass[key] ? "text-emerald-800" : "text-slate-500"}`}>{demo.bypass[key] ? "Bypassed" : "Enforced"}</span></div></li>)}</ul>}
      {!demo.loading && demo.mfa && <div className="mt-2 flex flex-wrap items-start justify-between gap-4 rounded-xl bg-slate-50 p-4"><div><p className="text-sm font-semibold text-slate-900">Multi-factor authentication</p><p className="mt-0.5 text-xs leading-5 text-slate-600">Profile default: <strong>{demo.mfa.profile_default ? "required" : "not required"}</strong>. {demo.mfa.admin_toggle_allowed ? "An administrator can change this while the demo runs." : "This profile does not allow changing it."}</p><p className="mt-1 font-mono text-[10px] text-slate-400">POST /v1/admin/mfa/toggle</p></div><div className="flex flex-col items-end gap-1"><Toggle checked={Boolean(demo.mfa.mfa_enabled)} busy={busyKey === "mfa"} disabled={!demo.mfa.admin_toggle_allowed} onChange={flipMfa} label="Multi-factor authentication" /><span className={`text-[11px] font-semibold ${demo.mfa.mfa_enabled ? "text-emerald-800" : "text-slate-500"}`}>{demo.mfa.mfa_enabled ? "Required" : "Off"}</span></div></div>}
      {notice && <div className="mt-4"><Notice kind={notice.kind}>{notice.text}</Notice></div>}
      {!demo.loading && !demo.error && <p className="mt-3 text-xs leading-5 text-slate-500">Changing a toggle requires the <code className="font-mono">platform_admin</code> role. A non-admin session still sees the current state and receives <code className="font-mono">403</code> when it tries to change one.</p>}
    </section>

    <section className={`${panel} p-5 sm:p-6`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">API surface</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Endpoints this console uses</h2>
      <p className="mt-1 text-sm text-slate-600">Every path below is relative to <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">VITE_IREME_API_URL</code>. Requests carry the Supabase bearer token when a session exists; otherwise the API creates a demo principal.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-semibold">Method</th><th className="py-2 pr-3 font-semibold">Path</th><th className="py-2 font-semibold">Purpose</th></tr></thead><tbody className="divide-y divide-slate-100">{API_SURFACE.map(({ method, path, note }) => <tr key={`${method}-${path}`}><td className="whitespace-nowrap py-2 pr-3"><span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${method.startsWith("GET") ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-900"}`}>{method}</span></td><td className="whitespace-nowrap py-2 pr-3 font-mono text-[11px] text-slate-800">{path}</td><td className="py-2 text-slate-600">{note}</td></tr>)}</tbody></table></div>
    </section>

    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" /><div><h3 className="text-sm font-semibold text-amber-950">Demonstration boundary</h3><p className="mt-1 text-sm leading-6 text-amber-900">The demo profile relaxes human approval, statistician sign-off and production-infrastructure gates so an analyst can complete a run end to end. It never allows microdata access and never marks the output as independently certified; exports stay labelled <strong>DEMONSTRATION / NOT INDEPENDENTLY CERTIFIED</strong>. Running the same API with <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">IREME_PROFILE=GOVERNED_PRODUCTION</code> restores every gate and hides these controls.</p></div></div></section>
  </div>;
}

export default function AIEngine() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState(searchParams.get("section") || "overview");
  const [runId, setRunId] = useState(searchParams.get("id") || "");
  const [district, setDistrict] = useState(searchParams.get("district") || "Rwanda");
  const [investigation, setInvestigation] = useState(null);
  const [lineage, setLineage] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [job, setJob] = useState(null);
  const [permissionId, setPermissionId] = useState("");
  const [indicatorKey, setIndicatorKey] = useState("");
  const [catalog, setCatalog] = useState({ loading: true, runs: [], permissions: [], indicators: [], error: null });
  const [proposals, setProposals] = useState(null);
  const [reportRecord, setReportRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const setCurrentSection = (next) => {
    setSection(next);
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("section"); else params.set("section", next);
    setSearchParams(params, { replace: true });
  };

  const loadRun = useCallback(async (requestedId = runId, requestedDistrict = district) => {
    if (!requestedId.trim()) return;
    setBusy(true); setNotice(null); setInvestigation(null); setLineage(null); setLedger(null);
    try {
      const safeId = encodeURIComponent(requestedId.trim());
      const query = `?district=${encodeURIComponent(requestedDistrict.trim() || "Rwanda")}`;
      const data = await requestGoverned(`/v1/investigations/${safeId}${query}`);
      setInvestigation(data);
      setRunId(data.investigation_id);
      setDistrict(data.district || requestedDistrict);
      setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set("id", data.investigation_id); next.set("district", data.district || requestedDistrict); return next; }, { replace: true });
      setNotice({ kind: "success", text: "Authorized investigation record loaded from the governed API." });
      const [lineageResult, ledgerResult] = await Promise.allSettled([
        requestGoverned(`/v1/investigations/${safeId}/lineage${query}`),
        requestGoverned(`/v1/investigations/${safeId}/hypotheses${query}`),
      ]);
      if (lineageResult.status === "fulfilled") setLineage(lineageResult.value);
      if (ledgerResult.status === "fulfilled") setLedger(ledgerResult.value);
      const failed = [lineageResult, ledgerResult].filter((item) => item.status === "rejected");
      if (failed.length) setNotice({ kind: "info", text: `Run loaded. ${describeFailures(failed.map((item) => item.reason), "related section")}` });
    } catch (error) { setNotice(failedNotice(error, "investigation run")); }
    finally { setBusy(false); }
  }, [district, runId, setSearchParams]);

  const loadCatalog = useCallback(async () => {
    setCatalog((current) => ({ ...current, loading: true, error: null }));
    const [runsResult, permissionsResult, indicatorsResult] = await Promise.allSettled([
      requestGoverned("/v1/investigations?limit=50"),
      requestGoverned("/v1/permissions"),
      requestGoverned("/v1/indicators"),
    ]);
    const runs = runsResult.status === "fulfilled" ? runsResult.value.runs || [] : [];
    const permissions = permissionsResult.status === "fulfilled" ? permissionsResult.value.permissions || [] : [];
    const indicators = indicatorsResult.status === "fulfilled" ? indicatorsResult.value.indicators || [] : [];
    const failed = [runsResult, permissionsResult, indicatorsResult].find((item) => item.status === "rejected");
    // An empty list after a failed read is not "nothing recorded": it is "not read". The two sentences have to stay apart,
    // otherwise a permission problem silently looks like an empty workspace.
    setCatalog({ loading: false, runs, permissions, indicators, error: failed ? failureNotice(failed.reason, "run, permission and indicator catalog").text : null });
    setPermissionId((current) => current || permissions.find((item) => item.active)?.permission_id || "");
    setIndicatorKey((current) => current || (indicators[0] ? `${indicators[0].indicator_id}::${indicators[0].definition_version}` : ""));
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  useEffect(() => {
    const initialId = searchParams.get("id");
    if (!initialId) return undefined;
    let active = true;
    const initialDistrict = searchParams.get("district") || "Rwanda";
    requestGoverned(`/v1/jobs/${encodeURIComponent(initialId)}`).then((status) => {
      if (!active) return;
      setRunId(initialId);
      setDistrict(initialDistrict);
      if (status.status === "complete") loadRun(initialId, initialDistrict);
      else setJob({ ...status, investigation_id: status.run_id });
    }).catch(() => {
      if (active) loadRun(initialId, initialDistrict);
    });
    return () => { active = false; };
  // Read the run referenced by a direct link once when the workspace opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!job?.run_id || !["queued", "running"].includes(job.status)) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const status = await requestGoverned(`/v1/jobs/${encodeURIComponent(job.run_id)}`);
        if (!active) return;
        setJob({ ...status, investigation_id: status.run_id });
        if (status.status === "complete") loadRun(status.run_id, "Rwanda");
        if (status.status === "failed") setNotice({ kind: "error", text: "The analysis stopped. Check the API service log for a redacted failure category, correct the setup issue, then resume the saved run." });
      } catch (error) { if (active) setNotice(failedNotice(error, "job status")); }
    }, 1400);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job, loadRun]);

  const refreshRelated = async () => {
    if (!investigation) return;
    setBusy(true); setNotice(null);
    const id = encodeURIComponent(investigation.investigation_id);
    const query = `?district=${encodeURIComponent(investigation.district || district)}`;
    const results = await Promise.allSettled([requestGoverned(`/v1/investigations/${id}/lineage${query}`), requestGoverned(`/v1/investigations/${id}/hypotheses${query}`)]);
    if (results[0].status === "fulfilled") setLineage(results[0].value);
    if (results[1].status === "fulfilled") setLedger(results[1].value);
    const failedRefresh = results.filter((result) => result.status === "rejected");
    setNotice(failedRefresh.length
      ? { kind: "error", text: failedRefresh.length === results.length
        ? `${describeFailures(failedRefresh.map((result) => result.reason), "evidence section")} Neither the evidence chain nor the hypothesis ledger was refreshed, so what is on screen may be an earlier read.`
        : `${describeFailures(failedRefresh.map((result) => result.reason), "evidence section")} One section kept its earlier read.` }
      : { kind: "success", text: "Evidence and hypothesis history refreshed." });
    setBusy(false);
  };

  const saveHypotheses = async (body) => {
    setBusy(true); setNotice(null);
    try {
      const id = encodeURIComponent(investigation.investigation_id);
      const query = `?district=${encodeURIComponent(investigation.district || district)}`;
      const saved = await requestGoverned(`/v1/investigations/${id}/hypotheses${query}`, { method: "POST", body, idempotencyKey: crypto.randomUUID() });
      setNotice({ kind: "success", text: "Hypothesis revision saved to the governed ledger." });
      await refreshRelated();
      return saved;
    } catch (error) { setNotice(failedNotice(error, "hypothesis ledger")); }
    finally { setBusy(false); }
  };

  const runAgent = async (body) => {
    setBusy(true); setNotice(null); setProposals(null);
    try {
      const id = encodeURIComponent(investigation.investigation_id);
      const query = `?district=${encodeURIComponent(investigation.district || district)}`;
      const result = await requestGoverned(`/v1/investigations/${id}/agent-proposals${query}`, { method: "POST", body });
      setProposals(result);
      setNotice({ kind: "success", text: "Research proposals received. Review them against source evidence before use." });
    } catch (error) { setNotice(failedNotice(error, "research proposals")); }
    finally { setBusy(false); }
  };

  const startRun = async ({ permission, purpose, indicator_id, definition_version }) => {
    if (!permission) { setNotice({ kind: "error", text: "No active dataset permission is recorded for this tenant." }); return; }
    setBusy(true); setNotice(null); setInvestigation(null); setLineage(null); setLedger(null);
    try {
      const result = await requestGoverned("/v1/investigations", {
        method: "POST",
        body: { dataset_id: permission.dataset_id, dataset_version: permission.dataset_version, permission_id: permission.permission_id, purpose, indicator_id, definition_version },
        idempotencyKey: crypto.randomUUID(),
      });
      setRunId(result.investigation_id);
      setDistrict("Rwanda");
      setJob({ ...result, run_id: result.investigation_id });
      setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set("id", result.investigation_id); next.set("district", "Rwanda"); return next; }, { replace: true });
      setNotice({ kind: "success", text: "Authorized EICV7 analysis queued. The worker status will update here." });
      loadCatalog();
    } catch (error) { setNotice(failedNotice(error, "new run")); }
    finally { setBusy(false); }
  };

  const resumeRun = async () => {
    if (!job?.run_id) return;
    setBusy(true); setNotice(null);
    try {
      const result = await requestGoverned(`/v1/investigations/${encodeURIComponent(job.run_id)}/resume`, { method: "POST" });
      setJob({ ...result, run_id: result.investigation_id || job.run_id });
      setNotice({ kind: "success", text: "Checkpointed analysis resumed. The original dataset permission is checked again." });
    } catch (error) { setNotice(failedNotice(error, "checkpointed run")); }
    finally { setBusy(false); }
  };

  const reviewReport = async ({ reportId, body }) => {
    setBusy(true); setNotice(null); setReportRecord(null);
    try { const result = await requestGoverned(`/v1/reports/${encodeURIComponent(reportId)}/review`, { method: "POST", body, idempotencyKey: crypto.randomUUID() }); setReportRecord(result); setNotice({ kind: "success", text: "Review response recorded by the governed API." }); }
    catch (error) { setNotice(failedNotice(error, "review record")); }
    finally { setBusy(false); }
  };
  const publishReport = async ({ reportId, version }) => {
    setBusy(true); setNotice(null);
    try { const result = await requestGoverned(`/v1/reports/${encodeURIComponent(reportId)}/publish`, { method: "POST", body: { version }, idempotencyKey: crypto.randomUUID() }); setReportRecord(result); setNotice({ kind: "success", text: "Publication request completed by the governed API." }); }
    catch (error) { setNotice(failedNotice(error, "publication request")); }
    finally { setBusy(false); }
  };
  const exportReport = async ({ reportId, version, format }) => {
    setBusy(true); setNotice(null);
    try {
      const file = await requestGoverned(`/v1/reports/${encodeURIComponent(reportId)}/export?version=${encodeURIComponent(version)}&format=${format}`, { responseType: "blob" });
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${reportId}-${version}.${format}`; anchor.click(); URL.revokeObjectURL(url);
      setNotice({ kind: "success", text: "Released report downloaded from the governed API." });
    } catch (error) { setNotice(failedNotice(error, "released report file")); }
    finally { setBusy(false); }
  };

  const page = useMemo(() => {
    if (section === "evidence") return <EvidencePage investigation={investigation} lineage={lineage} busy={busy} onRefresh={refreshRelated} />;
    if (section === "hypotheses") return <HypothesesPage investigation={investigation} ledger={ledger} busy={busy} onRefresh={refreshRelated} onSave={saveHypotheses} />;
    if (section === "agents") return <AgentsPage investigation={investigation} busy={busy} proposals={proposals} onRun={runAgent} />;
    if (section === "reports") return <ReportsPage busy={busy} reportRecord={reportRecord} onReview={reviewReport} onPublish={publishReport} onExport={exportReport} />;
    if (section === "access") return <AccessPage />;
    return <Overview investigation={investigation} runId={runId} district={district} setRunId={setRunId} setDistrict={setDistrict} onLoad={() => loadRun()} onStart={startRun} onResume={resumeRun} permissionId={permissionId} setPermissionId={setPermissionId} indicatorKey={indicatorKey} setIndicatorKey={setIndicatorKey} catalog={catalog} onReloadCatalog={loadCatalog} onLoadRun={(id) => loadRun(id, district)} job={job} busy={busy} lineage={lineage} hypotheses={ledger} onSection={setCurrentSection} />;
  // Page components use stable event callbacks from this component; the dashboard state is intentionally local.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, investigation, lineage, busy, ledger, proposals, reportRecord, runId, district, job, permissionId, indicatorKey, catalog]);

  return <main className="min-h-[calc(100vh-4rem)] bg-[#f5f7f5] text-slate-900">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8"><Link to="/" aria-label="Back to dashboard" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link><div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><BrainCircuit className="h-4 w-4"/></div><div><p className="text-sm font-semibold text-slate-950">Ireme Insight</p><p className="text-[11px] text-slate-500">AI Engine · governed research workspace</p></div><div className="ml-auto flex items-center gap-2">{investigation && <span className="hidden max-w-[250px] truncate rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 sm:inline-flex">{investigation.district}</span>}<button type="button" className={secondary} onClick={() => setCurrentSection("access")}><ShieldCheck className="h-4 w-4 text-emerald-800"/><span className="hidden sm:inline">Governance</span></button></div></div></header>
    <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[240px_minmax(0,1fr)]"><aside className="border-b border-slate-200 bg-white p-3 lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:p-5"><p className="hidden px-3 pb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 lg:block">Workspace</p><nav data-tour="inv-tabs" aria-label="AI Engine pages" className="flex gap-1 overflow-x-auto lg:flex-col">{SECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => setCurrentSection(id)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition lg:w-full ${section === id ? "bg-emerald-50 text-emerald-950" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className={`h-4 w-4 ${section === id ? "text-emerald-800" : "text-slate-400"}`} />{label}</button>)}</nav><div className="mt-6 hidden rounded-xl border border-slate-200 bg-slate-50 p-3 lg:block"><div className="flex items-center gap-2 text-xs font-semibold text-slate-800"><LockKeyhole className="h-3.5 w-3.5 text-emerald-800"/>Permission checked</div><p className="mt-1.5 text-[11px] leading-5 text-slate-500">All research data is loaded through the governed API using your signed-in session.</p></div></aside>
      <section className="min-w-0 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-1.5 text-xs text-slate-500"><span>Workspace</span><ChevronRight className="h-3 w-3"/><span className="text-slate-700">{SECTIONS.find((item) => item.id === section)?.label}</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{SECTIONS.find((item) => item.id === section)?.label}</h1></div>{investigation && section !== "overview" && <button type="button" className={secondary} onClick={() => setCurrentSection("overview")}><ArrowLeft className="h-4 w-4"/>Run overview</button>}</div>{notice && <div className="mb-4"><Notice kind={notice.kind}>{notice.text}</Notice></div>}{!GOVERNED_API_CONFIGURED && <div className="mb-4"><Notice>This deployment has no governed API address. Set <code className="rounded bg-white px-1 font-mono text-[11px]">VITE_IREME_API_URL</code> to the running Ireme API and redeploy to load runs, permissions and demo controls.</Notice></div>}{page}<footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[11px] text-slate-500"><span>Evidence state is supplied by the governed research API.</span><span className="inline-flex items-center gap-1"><LockKeyhole className="h-3 w-3"/> Data access is scope checked</span></footer></div></section>
    </div>
  </main>;
}
