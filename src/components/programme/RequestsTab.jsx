import React, { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Inbox, Loader2, Search, XCircle } from "lucide-react";
import SidePanel from "@/components/investigation/SidePanel";
import { useProgrammeScope } from "@/lib/programmeScope";
import { useDemoAuth } from "@/lib/DemoAuthContext";
import { actorFrom, isOpen, requestStats, typeLabel, useActionRequests } from "@/lib/actionRequests";
import { PriorityDot, StatusChip, Timeline, ago, dateLabel } from "@/components/requests/bits";

const FILTERS = [["all", "All"], ["waiting", "Waiting for you"], ["active", "In progress"], ["done", "Completed"], ["closed", "Declined or withdrawn"]];
const match = { all: () => true, waiting: (item) => item.status === "Submitted", active: (item) => ["Accepted", "In progress"].includes(item.status), done: (item) => item.status === "Completed", closed: (item) => ["Declined", "Withdrawn"].includes(item.status) };
const input = "mt-1 w-full rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";

function Kpi({ icon: Icon, label, value, foot, tone = "text-brand" }) {
  return <div className="rounded-xl border border-hairline bg-white px-4 py-3.5"><div className="flex items-center justify-between"><p className="text-[11.5px] font-medium text-sub">{label}</p><Icon className={`h-4 w-4 ${tone}`} /></div><p className="mt-1 text-[24px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p><p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p></div>;
}

function Detail({ item, actor, advance, onClose, agentPool }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState(item.due || "");
  const [outcome, setOutcome] = useState("");
  const [error, setError] = useState("");
  const agents = useMemo(() => { const local = agentPool.filter((agent) => agent.district === item.district).map((agent) => agent.name); return [...local, ...(local.length ? [] : agentPool.slice(0, 6).map((agent) => agent.name)), "Programme team"]; }, [item.district, agentPool]);
  const act = (to, extra = {}) => { setError(""); try { advance(item.id, { to, by: actor, note, ...extra }); setMode(null); setNote(""); setOutcome(""); } catch (failure) { setError(failure.message); } };
  const open = isOpen(item.status);

  return <SidePanel overlay title={item.title} subtitle={`${item.id} · ${item.district} · ${item.programme}`} icon={Inbox} onClose={onClose} actions={<StatusChip status={item.status} />}>
    <div className="space-y-5 p-4">
      <section><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-sub"><PriorityDot priority={item.priority} /><span>{typeLabel(item.type)}</span><span>Requested by {item.createdBy.name}, {ago(item.createdAt)}</span>{item.sample && <span className="rounded bg-canvas px-1.5 py-0.5">sample data</span>}</div>
        <h3 className="mt-3 text-[10.5px] font-semibold uppercase tracking-wide text-sub">What the analyst asks</h3><p className="mt-1 text-[13px] leading-relaxed text-ink">{item.ask}</p>
        {(item.assignee || item.due) && <p className="mt-2 text-[11.5px] text-sub">{item.assignee ? `Assigned to ${item.assignee}` : ""}{item.assignee && item.due ? " · " : ""}{item.due ? `due ${dateLabel(item.due)}` : ""}</p>}</section>

      {item.evidence.length > 0 && <section><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">Evidence from the investigation</h3><dl className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">{item.evidence.map((row) => <div key={row.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[170px_1fr]"><dt className="text-[11.5px] text-sub">{row.label}</dt><dd className="text-[12px] text-ink">{row.value}</dd></div>)}</dl>{item.context && <p className="mt-2 text-[11.5px] leading-relaxed text-sub">{item.context}</p>}<p className="mt-2 text-[10.5px] text-sub">Survey figures describe conditions; they do not prove why. Please check locally.</p></section>}

      {item.status === "Completed" && item.outcome && <section className="rounded-lg border border-[#ABEFC6] bg-[#ECFDF3]/60 p-3"><p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#067647]"><CheckCircle2 className="h-3.5 w-3.5" />Your answer to the analyst</p><p className="mt-1 text-[12px] leading-relaxed text-ink">{item.outcome.note}</p></section>}

      {open && <section className="rounded-xl border border-hairline bg-canvas/50 p-3.5">
        <h3 className="text-[12.5px] font-semibold text-ink">Your decision</h3>
        {mode === null && <div className="mt-2.5 flex flex-wrap gap-2">
          {item.status === "Submitted" && <><button type="button" onClick={() => setMode("accept")} className="rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]">Accept and assign</button><button type="button" onClick={() => setMode("decline")} className="rounded-md border border-hairline bg-white px-3 py-2 text-[12px] font-medium text-ink hover:bg-canvas">Decline with a reason</button></>}
          {item.status === "Accepted" && <button type="button" onClick={() => act("In progress", { note: note || "Work has started." })} className="rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]">Start work</button>}
          {["Accepted", "In progress"].includes(item.status) && <button type="button" onClick={() => setMode("complete")} className="rounded-md border border-hairline bg-white px-3 py-2 text-[12px] font-medium text-ink hover:bg-canvas">Complete and report back</button>}
          {item.status === "Accepted" && <button type="button" onClick={() => setMode("decline")} className="rounded-md px-3 py-2 text-[12px] font-medium text-red-700 hover:bg-red-50">Decline</button>}
        </div>}
        {mode === "accept" && <div className="mt-3 space-y-3"><label className="block text-[11.5px] font-medium text-ink">Assign to<select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={input}><option value="">Choose who will do it</option>{agents.map((name) => <option key={name}>{name}</option>)}</select></label><label className="block text-[11.5px] font-medium text-ink">Finish by<input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={input} /></label><label className="block text-[11.5px] font-medium text-ink">Note to the analyst (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className={`${input} resize-y`} /></label>
          <div className="flex gap-2"><button type="button" disabled={!assignee} onClick={() => act("Accepted", { assignee, due: due || null, note: note || `Assigned to ${assignee}.` })} className="rounded-md bg-brand px-3 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0] disabled:opacity-50">Accept request</button><button type="button" onClick={() => setMode(null)} className="rounded-md px-3 py-2 text-[12px] text-sub hover:text-ink">Back</button></div></div>}
        {mode === "decline" && <div className="mt-3 space-y-3"><label className="block text-[11.5px] font-medium text-ink">Reason (the analyst will read this)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={`${input} resize-y`} placeholder="For example: budget fully allocated, outside this programme's scope, or already covered." /></label><div className="flex gap-2"><button type="button" onClick={() => act("Declined")} className="rounded-md bg-red-600 px-3 py-2 text-[12px] font-medium text-white hover:bg-red-700">Decline request</button><button type="button" onClick={() => { setMode(null); setNote(""); }} className="rounded-md px-3 py-2 text-[12px] text-sub hover:text-ink">Back</button></div></div>}
        {mode === "complete" && <div className="mt-3 space-y-3">{item.status === "Accepted" && <p className="rounded-md bg-white p-2 text-[11px] text-sub">This request will be marked as started and then completed.</p>}<label className="block text-[11.5px] font-medium text-ink">What was found or done<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} rows={4} className={`${input} resize-y`} placeholder="Numbers, places and anything the analyst should change in their conclusions." /></label><div className="flex gap-2"><button type="button" onClick={() => { setError(""); try { if (item.status === "Accepted") advance(item.id, { to: "In progress", by: actor, note: "Work has started." }); advance(item.id, { to: "Completed", by: actor, outcome, note: "Reported back to the analyst." }); setMode(null); setOutcome(""); } catch (failure) { setError(failure.message); } }} className="rounded-md bg-[#067647] px-3 py-2 text-[12px] font-medium text-white hover:bg-[#05603A]">Send answer to analyst</button><button type="button" onClick={() => setMode(null)} className="rounded-md px-3 py-2 text-[12px] text-sub hover:text-ink">Back</button></div></div>}
        {error && <p role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11.5px] text-red-700"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />{error}</p>}
      </section>}

      <section><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">History</h3><div className="mt-2.5"><Timeline history={item.history} /></div></section>
    </div>
  </SidePanel>;
}

export default function RequestsTab() {
  const scope = useProgrammeScope();
  const { requests: allRequests, advance } = useActionRequests();
  const requests = useMemo(() => allRequests.filter((item) => scope.owns(item.programme)), [allRequests, scope]);
  const { demoUser } = useDemoAuth();
  const actor = actorFrom(demoUser, "programme_owner");
  const [filter, setFilter] = useState("all");
  const [district, setDistrict] = useState("All");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const stats = requestStats(requests);
  const districts = ["All", ...new Set(requests.map((item) => item.district))];
  const shown = requests.filter((item) => match[filter](item) && (district === "All" || item.district === district) && `${item.title} ${item.id} ${item.programme}`.toLowerCase().includes(q.toLowerCase()));
  const selected = requests.find((item) => item.id === openId);

  return <div data-judge="requests" className="space-y-4">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-tour="requests-kpis">
      <Kpi icon={Inbox} label="Waiting for your decision" value={stats.waiting} foot="new requests from analysts" tone={stats.waiting ? "text-[#B54708]" : "text-brand"} />
      <Kpi icon={Loader2} label="In progress" value={stats.active} foot="accepted and being worked on" />
      <Kpi icon={CheckCircle2} label="Completed" value={stats.completed} foot={stats.averageDays != null ? `about ${stats.averageDays.toFixed(0)} days on average` : "none finished yet"} tone="text-[#067647]" />
      <Kpi icon={XCircle} label="Declined" value={stats.declined} foot="with a reason sent back" tone="text-[#B42318]" />
    </div>
    <div className="flex flex-wrap items-center gap-2" data-tour="requests-filters">
      <div className="flex flex-wrap gap-1.5">{FILTERS.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium ${filter === key ? "border-brand bg-brand-soft text-brand" : "border-hairline bg-white text-sub hover:text-ink"}`}>{label}</button>)}</div>
      <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A94A6]" /><input value={q} onChange={(event) => setQ(event.target.value)} data-tour="requests-search" placeholder="Search requests…" className="w-full rounded-md border border-hairline py-2 pl-9 pr-3 text-[12.5px] text-ink outline-none focus:border-brand" /></div>
      <select value={district} onChange={(event) => setDistrict(event.target.value)} aria-label="District" className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand">{districts.map((name) => <option key={name}>{name}</option>)}</select>
    </div>
    {shown.length === 0 ? <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-10 text-center text-[12.5px] text-sub">{requests.length === 0 ? "No requests yet. Analysts send them from a district investigation." : "No requests match these filters."}</p>
      : <ul className="space-y-2.5" data-tour="requests-list">{shown.map((item) => <li key={item.id}><button type="button" onClick={() => setOpenId(item.id)} className={`flex w-full flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-4 text-left transition-colors hover:border-brand/40 ${openId === item.id ? "border-brand/50" : "border-hairline"}`}>
        <div className="min-w-0 flex-1"><p className="text-[10.5px] text-sub">{item.id} · {item.district} · {item.programme}{item.sample && <span className="ml-1.5 rounded bg-canvas px-1.5 py-0.5">sample</span>}</p><h3 className="mt-0.5 text-[13.5px] font-semibold text-ink">{item.title}</h3><p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-sub">{item.ask}</p></div>
        <div className="flex shrink-0 flex-col items-end gap-1.5"><StatusChip status={item.status} /><PriorityDot priority={item.priority} /><span className="inline-flex items-center gap-1 text-[10.5px] text-sub"><Clock className="h-3 w-3" />{ago(item.createdAt)}</span></div>
      </button></li>)}</ul>}
    {selected && <Detail key={selected.id} item={selected} actor={actor} advance={advance} agentPool={scope.agents} onClose={() => setOpenId(null)} />}
  </div>;
}
