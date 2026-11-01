import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, ArrowUpRight, BrainCircuit, Clock3, Database, FileText, LoaderCircle, Play, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useApiClient } from "@/lib/apiClient";

const DISTRICTS = ["Bugesera", "Burera", "Gakenke", "Gasabo", "Gatsibo", "Gicumbi", "Gisagara", "Huye", "Kamonyi", "Karongi", "Kayonza", "Kicukiro", "Kirehe", "Muhanga", "Musanze", "Ngoma", "Ngororero", "Nyabihu", "Nyagatare", "Nyamagabe", "Nyamasheke", "Nyanza", "Nyarugenge", "Nyaruguru", "Rubavu", "Ruhango", "Rusizi", "Rutsiro", "Rwamagana", "Rulindo"];
const card = "rounded-lg border border-hairline bg-white";

function Stat({ icon: Icon, label, value, note }) {
  return <div className={`${card} p-4`}><div className="flex items-center justify-between"><span className="text-[12px] text-sub">{label}</span><Icon className="h-4 w-4 text-brand" aria-hidden="true" /></div><p className="mt-3 text-[24px] font-semibold tracking-tight text-ink">{value}</p><p className="mt-1 text-[11px] text-sub">{note}</p></div>;
}

export default function AIEngineDashboard() {
  const api = useApiClient();
  const [district, setDistrict] = useState("Gisagara");
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getInvestigationHistory();
      setRuns(Array.isArray(data) ? data : data?.investigations || data?.items || []);
    } catch (cause) {
      setError(cause.message || "Could not connect to the investigation service.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { refresh(); }, [refresh]);

  async function startInvestigation(event) {
    event.preventDefault();
    setStarting(true);
    setError("");
    try {
      await api.createInvestigation(district);
      await refresh();
    } catch (cause) {
      setError(cause.message || "Could not start this investigation.");
    } finally {
      setStarting(false);
    }
  }

  const completed = runs.filter((run) => String(run.status || "").toLowerCase() === "completed").length;
  const active = runs.filter((run) => ["running", "queued", "pending"].includes(String(run.status || "").toLowerCase())).length;

  return <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-brand"><BrainCircuit className="h-4 w-4" /> Ireme Insight Engine</div><h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">AI Engine</h1><p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-sub">Run district investigations against survey evidence. Results are analytical associations and require review before they inform decisions.</p></div>
      <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-hairline bg-white px-3 py-2 text-[12px] font-medium text-ink hover:bg-canvas disabled:opacity-60"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Engine overview">
      <Stat icon={Activity} label="Investigation runs" value={loading ? "—" : runs.length} note="Recorded by the investigation service" />
      <Stat icon={Play} label="In progress" value={loading ? "—" : active} note="Queued or currently running" />
      <Stat icon={ShieldCheck} label="Completed" value={loading ? "—" : completed} note="Completion does not mean approved" />
      <Stat icon={Database} label="Evidence base" value="EICV" note="Microdata access depends on worker setup" />
    </section>

    <section className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start gap-3"><div className="rounded-md bg-[#F0EFFF] p-2 text-brand"><Search className="h-4 w-4" /></div><div><h2 className="text-[15px] font-semibold text-ink">Start a district investigation</h2><p className="mt-1 text-[12px] text-sub">Choose a district to request a fresh analysis from the connected engine.</p></div></div>
      <form onSubmit={startInvestigation} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="grid gap-1 text-[11px] font-medium text-sub">District<select value={district} onChange={(event) => setDistrict(event.target.value)} className="min-w-56 rounded-md border border-hairline bg-white px-3 py-2 text-[13px] text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">{DISTRICTS.map((name) => <option key={name}>{name}</option>)}</select></label>
        <button type="submit" disabled={starting} className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0] disabled:opacity-60">{starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{starting ? "Starting…" : "Run investigation"}</button>
      </form>
      {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] leading-relaxed text-amber-900"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Engine connection issue.</strong> {error} Check that the investigation API is configured and reachable.</span></div>}
      <p className="mt-3 text-[11px] text-sub">The investigation service may be available only in local development unless a production API has been configured.</p>
    </section>

    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3"><div><h2 className="text-[15px] font-semibold text-ink">Recent investigations</h2><p className="mt-0.5 text-[11px] text-sub">History returned by the investigation API.</p></div><span className="inline-flex items-center gap-1 text-[11px] text-sub"><Clock3 className="h-3.5 w-3.5" /> {runs.length} runs</span></div>
      {loading ? <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-sub"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading investigation history…</div> : runs.length === 0 ? <div className="px-4 py-9 text-center"><FileText className="mx-auto h-6 w-6 text-sub" /><p className="mt-2 text-[13px] font-medium text-ink">No investigation runs yet</p><p className="mt-1 text-[11px] text-sub">Start an investigation above to see its status here.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[12px]"><thead className="bg-canvas text-[10px] uppercase tracking-wide text-sub"><tr><th className="px-4 py-2.5 font-medium">District</th><th className="px-4 py-2.5 font-medium">Run ID</th><th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 font-medium">Started</th><th className="px-4 py-2.5 font-medium">Details</th></tr></thead><tbody className="divide-y divide-hairline">{runs.slice(0, 20).map((run, index) => <tr key={run.id || index} className="hover:bg-canvas"><td className="px-4 py-3 font-medium text-ink">{run.district || "—"}</td><td className="px-4 py-3 font-mono text-[11px] text-sub">{run.id || run.run_id || "—"}</td><td className="px-4 py-3"><span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-medium text-ink">{run.status || "Unknown"}</span></td><td className="px-4 py-3 text-sub">{run.started_at ? new Date(run.started_at).toLocaleString() : "—"}</td><td className="px-4 py-3">{run.id && <button type="button" onClick={() => api.getInvestigation(run.id).then((result) => window.alert(JSON.stringify(result, null, 2))).catch((cause) => setError(cause.message))} className="inline-flex items-center gap-1 text-brand hover:underline">Open <ArrowUpRight className="h-3 w-3" /></button>}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-[10.5px] leading-relaxed text-sub">Engine outputs are research evidence, not causal estimates, eligibility decisions or programme performance ratings. Confirm sources, samples, uncertainty and external verification before using findings.</p>
  </main>;
}
