import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, CheckCircle2, ClipboardList, HeartPulse, Inbox, Search, Send, TriangleAlert, Users, Wallet } from "lucide-react";
import Card from "@/components/analyst/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NATIONAL_EICV7, groupRecords, statusStyle, surveyRow } from "@/lib/govArea";
import { ISSUE_KINDS, ISSUE_STATUSES, canUpdateIssue, visibleIssues } from "@/lib/govIssues";
import { PRIORITIES, PROGRAMME_NAMES, isOpen, typeLabel } from "@/lib/actionRequests";
import { ago } from "@/components/requests/bits";

const input = "mt-1 w-full rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] text-ink outline-none focus:border-brand";
const short = (name) => ({ "VUP Direct Support": "VUP", "Girinka Munyarwanda": "Girinka", "Expanded Public Works": "Public Works", "Nsymibondo y'Icyaro": "Nsymibondo" }[name] || name);
export const RECORDS_NOTE = "Counts come from the program member records held on this platform. The survey (EICV7) is published only down to district level.";

function Kpi({ icon: Icon, label, value, foot, warn }) {
  return <div className="rounded-xl border border-hairline bg-white px-4 py-3.5"><div className="flex items-center gap-2 text-sub"><Icon className="h-4 w-4" strokeWidth={1.9} /><span className="text-[11.5px] font-medium">{label}</span></div><p className={`mt-1.5 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${warn ? "text-[#B54708]" : "text-ink"}`}>{value}</p><p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p></div>;
}
const Empty = ({ children }) => <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-8 text-center text-[12.5px] text-sub">{children}</p>;

// ---------------------------------------------------------------- Overview
export function GovOverview({ area, scope, problems, issues, requests }) {
  const row = surveyRow(area.district);
  const by = scope.sector ? "cell" : "sector";
  const groups = useMemo(() => groupRecords(area.records, by), [area.records, by]);
  // The bars plot the first fourteen groups; the textual alternative describes those same rows, no more.
  const plotted = groups.slice(0, 14);
  const total = area.records.length;
  const count = (status) => area.records.filter((item) => item.status === status).length;
  const attention = groups.filter((item) => item.attention > 0).sort((a, b) => b.attention - a.attention).slice(0, 5);
  const open = issues.filter((item) => item.status !== "Resolved").length;
  const openRequests = requests.filter((item) => isOpen(item.status)).length;

  return <div className="space-y-4">
    <div><h2 className="text-[20px] font-semibold tracking-tight text-ink">{scope.cell ? `${scope.cell} cell` : scope.sector ? `${scope.sector} sector` : `${area.district} district`}</h2><p className="mt-0.5 text-[12px] text-sub">Information within your assigned administrative area only.</p></div>

    {row ? <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi icon={Users} label="Poverty rate" value={`${row.poverty.toFixed(1)}%`} foot={`of people in ${row.name} · Rwanda ${NATIONAL_EICV7.poverty.toFixed(1)}%`} warn={row.poverty > NATIONAL_EICV7.poverty} />
      <Kpi icon={Users} label="Extreme poverty" value={`${row.extremePoverty.toFixed(1)}%`} foot={`of people · Rwanda ${NATIONAL_EICV7.extremePoverty.toFixed(1)}%`} />
      <Kpi icon={Wallet} label="VUP participation" value={`${row.vupAmongPoor.toFixed(1)}%`} foot={`of ${row.samplePoorHouseholds} surveyed poor households · Rwanda ${NATIONAL_EICV7.vupAmongPoor.toFixed(1)}%`} />
      <Kpi icon={ClipboardList} label="Survey" value="EICV7" foot="2023/24 · district level only" />
    </div> : <Empty>No survey figures are held for {area.district}.</Empty>}

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi icon={Users} label="Program Members in your area" value={total} foot={`${count("Active")} active · ${count("Pending")} pending · ${count("Suspended")} suspended`} />
      <Kpi icon={Wallet} label="Payments not delivered" value={problems.payments.length} foot="failed or pending in the payment records" warn={problems.payments.length > 0} />
      <Kpi icon={HeartPulse} label="Health cover unpaid" value={problems.health.filter((item) => item.health.status === "Unpaid").length} foot={`${problems.health.filter((item) => item.health.status === "Expiring").length} more expiring`} warn={problems.health.some((item) => item.health.status === "Unpaid")} />
      <Kpi icon={Inbox} label="Open reports and requests" value={open + openRequests} foot={`${open} field reports · ${openRequests} programme requests`} warn={open + openRequests > 0} />
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card title={`Program Members by ${by}`} subtitle="Records on this platform" className="xl:col-span-2">
        {groups.length === 0 ? <Empty>No program member records in your area.</Empty> : <div role="img" aria-label={`Program members by ${by}, stacked by status. ${plotted.map((item) => `${item.name}: ${item.active} active, ${item.pending} pending, ${item.suspended} suspended`).join(". ")}.`}>
        <ResponsiveContainer width="100%" height={Math.max(226, Math.min(groups.length, 14) * 26)}>
          <BarChart data={plotted} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }} barCategoryGap="22%">
            <CartesianGrid horizontal={false} stroke="#EDF1F7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 10.5, fill: "#5B6B80" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11 }} />
            <Bar dataKey="active" name="Active" stackId="a" fill="#635BFF" />
            <Bar dataKey="pending" name="Pending" stackId="a" fill="#F5B544" />
            <Bar dataKey="suspended" name="Suspended" stackId="a" fill="#E5604F" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer></div>}
      </Card>

      <Card title={`Where to look first`} subtitle={`${by === "cell" ? "Cells" : "Sectors"} with the most pending, suspended or unpaid cases`} bodyClassName="px-0 pb-0">
        {attention.length === 0 ? <p className="border-t border-hairline px-5 py-6 text-center text-[12px] text-sub">No open cases in the records.</p> : <ul className="border-t border-hairline">{attention.map((item) => <li key={item.name} className="border-b border-hairline/70 px-5 py-2.5 last:border-0"><p className="text-[12px] font-medium text-ink">{item.name}</p><p className="text-[10.5px] text-sub">{item.pending} pending · {item.suspended} suspended · {item.healthUnpaid} health cover unpaid · of {item.total}</p></li>)}</ul>}
      </Card>
    </div>
    <p className="text-[10.5px] leading-relaxed text-[#8A94A6]">{RECORDS_NOTE} Poverty and participation figures are for the whole district.</p>
  </div>;
}

// ---------------------------------------------------------------- Beneficiaries
export function GovBeneficiaries({ area, scope, onOpen }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");
  const [cell, setCell] = useState("");
  const [programme, setProgramme] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const options = (key) => [...new Set(area.records.map((item) => item[key]).filter(Boolean))].sort();
  const rows = area.records.filter((item) => (!query || item.name.toLowerCase().includes(query.toLowerCase())) && (!sector || item.sector === sector) && (!cell || item.cell === cell) && (!programme || item.programme === programme) && (!status || item.status === status));
  const size = 25;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const shown = rows.slice(page * size, page * size + size);
  const select = (value, set, label, list) => <select value={value} onChange={(event) => { set(event.target.value); setPage(0); }} aria-label={label} className="rounded-md border border-hairline bg-white px-2.5 py-2 text-[12px] text-ink outline-none focus:border-brand"><option value="">{label}</option>{list.map((item) => <option key={item}>{item}</option>)}</select>;

  return <div className="space-y-3">
    <div><h2 className="text-[20px] font-semibold tracking-tight text-ink">Program Members</h2><p className="mt-0.5 text-[12px] text-sub">People enrolled in programmes in your {scope.cell ? "cell" : scope.sector ? "sector" : "district"}. You see no one outside it.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-sub" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search by name" aria-label="Search by name" className="w-full rounded-md border border-hairline bg-white py-2 pl-8 pr-3 text-[12.5px] outline-none focus:border-brand" /></label>
      {!scope.sector && select(sector, setSector, "All sectors", options("sector"))}
      {!scope.cell && select(cell, setCell, "All cells", options("cell"))}
      {select(programme, setProgramme, "All programmes", options("programme"))}
      {select(status, setStatus, "Any status", ["Active", "Pending", "Suspended"])}
    </div>
    {rows.length === 0 ? <Empty>No program members match.</Empty> : <div className="overflow-x-auto rounded-xl border border-hairline bg-white"><table className="w-full min-w-[640px] border-collapse text-[12.5px]">
      <thead><tr className="border-b border-hairline bg-[#FAFBFD] text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]"><th className="px-4 py-2 text-left font-medium">Name</th><th className="px-3 py-2 text-left font-medium">Sector · cell</th><th className="px-3 py-2 text-left font-medium">Programme</th><th className="px-3 py-2 text-left font-medium">Status</th><th className="px-3 py-2 text-left font-medium">Health cover</th><th className="px-3 py-2 text-right font-medium"><span className="sr-only">Open</span></th></tr></thead>
      <tbody>{shown.map((item) => <tr key={item.id} className="border-b border-hairline/70 last:border-0 hover:bg-[#FAFBFD]"><td className="px-4 py-2.5 font-medium text-ink"><button type="button" onClick={() => onOpen(item)} className="text-left text-brand hover:underline">{item.name}</button></td><td className="px-3 py-2.5 text-sub">{item.sector} · {item.cell}</td><td className="px-3 py-2.5 text-sub">{short(item.programme)}</td><td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle[item.status] || ""}`}>{item.status}</span></td><td className={`px-3 py-2.5 ${item.health?.status === "Unpaid" ? "font-medium text-[#B42318]" : "text-sub"}`}>{item.health?.status || "Not recorded"}</td><td className="px-3 py-2.5 text-right"><button type="button" onClick={() => onOpen(item)} className="rounded-md border border-hairline px-2 py-1 text-[11px] font-medium text-ink hover:bg-canvas">360° view</button></td></tr>)}</tbody>
    </table></div>}
    <div className="flex items-center justify-between text-[11.5px] text-sub"><span>{rows.length} {rows.length === 1 ? "person" : "people"}</span>{pages > 1 && <span className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md border border-hairline px-2.5 py-1 hover:bg-canvas disabled:opacity-40">Previous</button>Page {page + 1} of {pages}<button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="rounded-md border border-hairline px-2.5 py-1 hover:bg-canvas disabled:opacity-40">Next</button></span>}</div>
  </div>;
}

// ---------------------------------------------------------------- Delivery problems
function AskDialog({ open, onOpenChange, kind, district, items, by, onCreate }) {
  const programmes = [...new Set(items.map((item) => item.programme || item.person?.programme).filter(Boolean))];
  const [programme, setProgramme] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [ask, setAsk] = useState("");
  const [error, setError] = useState("");
  const chosen = programme || programmes[0] || PROGRAMME_NAMES[0];
  const names = items.filter((item) => (item.programme || item.person?.programme) === chosen).map((item) => item.name || item.beneficiary);
  const text = ask || `${kind.ask} ${names.length} ${names.length === 1 ? "person is" : "people are"} affected in ${district}.`;
  const send = (event) => {
    event.preventDefault();
    try {
      onCreate({ district, type: kind.type, programme: chosen, priority, title: `${kind.title} in ${district}`, ask: text, evidence: [{ label: "People affected", value: String(names.length) }, { label: "Examples", value: names.slice(0, 5).join(", ") || "none listed" }], context: `Raised by ${by.name} (${by.role.replace("gov_", "")} leader) from the Government panel.` }, by);
      onOpenChange(false); setAsk(""); setError("");
    } catch (failure) { setError(failure.message); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="text-[16px]">Ask a programme team to act</DialogTitle><DialogDescription className="text-[12px]">{kind.title}. The programme sees this in its own panel and answers here.</DialogDescription></DialogHeader>
    <form onSubmit={send} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[11.5px] font-medium text-ink">Programme<select value={chosen} onChange={(event) => setProgramme(event.target.value)} className={input}>{(programmes.length ? programmes : PROGRAMME_NAMES).map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="block text-[11.5px] font-medium text-ink">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className={input}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <label className="block text-[11.5px] font-medium text-ink">What should they do?<textarea value={text} onChange={(event) => setAsk(event.target.value)} rows={4} className={`${input} resize-y`} /></label>
      <p className="text-[11px] text-sub">Includes {names.length} {names.length === 1 ? "person" : "people"} from this programme{names.length ? `: ${names.slice(0, 3).join(", ")}${names.length > 3 ? " and more" : ""}` : ""}.</p>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-[11.5px] text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-hairline px-3 py-2 text-[12px] font-medium text-ink hover:bg-canvas">Cancel</button><button type="submit" disabled={!names.length} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0] disabled:opacity-50"><Send className="h-3.5 w-3.5" />Send request</button></div>
    </form></DialogContent></Dialog>;
}

export function GovProblems({ area, problems, by, onCreate, onOpen }) {
  const [asking, setAsking] = useState(null);
  const groups = [
    { key: "payments", icon: Wallet, title: "Payments that did not arrive", note: "Failed or pending in the payment records.", items: problems.payments, kind: { type: "payments", title: "Payments not delivered", ask: "Find out why these payments failed or are late, and retry them." }, row: (item) => [item.beneficiary, `${item.person.sector} · ${item.person.cell}`, short(item.programme), `${item.status} · RWF ${item.amount.toLocaleString()} · ${item.date}`] },
    { key: "enrolment", icon: Users, title: "Enrolment waiting or suspended", note: "People whose enrolment is pending or suspended in the records.", items: problems.enrolment, kind: { type: "targeting", title: "Enrolment pending or suspended", ask: "Review these cases and tell us what is blocking each one." }, row: (item) => [item.name, `${item.sector} · ${item.cell}`, short(item.programme), item.status] },
    { key: "health", icon: HeartPulse, title: "Health cover unpaid or expiring", note: "From the health-cover status on each record.", items: problems.health, kind: { type: "coverage", title: "Health cover unpaid or expiring", ask: "Help these people renew their health cover before it lapses." }, row: (item) => [item.name, `${item.sector} · ${item.cell}`, short(item.programme), `${item.health.status}${item.health.expires ? ` · ${item.health.expires}` : ""}`] },
  ];
  return <div className="space-y-4">
    <div><h2 className="text-[20px] font-semibold tracking-tight text-ink">Delivery problems</h2><p className="mt-0.5 text-[12px] text-sub">What the records show is not working for people in your area. You can ask the programme team to act on each group.</p></div>
    {groups.map((group) => {
      const Icon = group.icon;
      return <section key={group.key} className="rounded-xl border border-hairline bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"><Icon className="h-4 w-4 text-brand" />{group.title}<span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-normal tabular-nums text-sub">{group.items.length}</span></h3><p className="mt-0.5 text-[11.5px] text-sub">{group.note}</p></div>
          {group.items.length > 0 && <button type="button" onClick={() => setAsking(group)} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[11.5px] font-medium text-white hover:bg-[#524BE0]"><Send className="h-3.5 w-3.5" />Ask a programme to act</button>}</div>
        {group.items.length === 0 ? <p className="mt-3 rounded-lg bg-canvas/60 px-3 py-4 text-center text-[12px] text-sub">Nothing found in the records.</p> : <ul className="mt-3 max-h-[300px] divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline">{group.items.slice(0, 60).map((item, index) => { const [name, place, programme, detail] = group.row(item); return <li key={`${name}-${index}`} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2 sm:grid-cols-[1.2fr_1fr_.8fr_1.2fr]"><button type="button" onClick={() => onOpen(item.person || item)} className="truncate text-left text-[12.5px] font-medium text-brand hover:underline">{name}</button><span className="truncate text-[11.5px] text-sub">{place}</span><span className="hidden truncate text-[11.5px] text-sub sm:block">{programme}</span><span className="text-[11.5px] text-ink">{detail}</span></li>; })}</ul>}
      </section>;
    })}
    {asking && <AskDialog key={asking.key} open onOpenChange={(value) => !value && setAsking(null)} kind={asking.kind} district={area.district} items={asking.items} by={by} onCreate={onCreate} />}
  </div>;
}

// ---------------------------------------------------------------- Field reports
export function GovIssues({ area, scope, store, by }) {
  const mine = visibleIssues(store.issues, scope, area.district).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const sectors = [...new Set(area.records.map((item) => item.sector))].sort();
  const cells = [...new Set(area.records.filter((item) => !scope.sector || item.sector === scope.sector).map((item) => item.cell))].sort();
  const blank = { kind: ISSUE_KINDS[0], title: "", note: "", sector: scope.sector || sectors[0] || "", cell: scope.cell || "" };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const submit = (event) => {
    event.preventDefault(); setError(""); setSent("");
    try { const made = store.create({ ...form, district: area.district }, by); setSent(made.id); setForm(blank); } catch (failure) { setError(failure.message); }
  };
  const move = (item, status) => { try { store.update(item.id, { status }, by); } catch (failure) { setError(failure.message); } };

  return <div className="grid gap-4 xl:grid-cols-3">
    <section className="xl:col-span-1"><h2 className="text-[20px] font-semibold tracking-tight text-ink">Report a problem</h2><p className="mt-0.5 text-[12px] text-sub">Tell the leaders above you what you found on the ground. Your sector and district leaders see it straight away.</p>
      <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-hairline bg-white p-4">
        <label className="block text-[11.5px] font-medium text-ink">Kind of problem<select value={form.kind} onChange={set("kind")} className={input}>{ISSUE_KINDS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label className="block text-[11.5px] font-medium text-ink">Sector<select value={form.sector} onChange={set("sector")} disabled={Boolean(scope.sector)} className={input}>{sectors.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-[11.5px] font-medium text-ink">Cell<select value={form.cell} onChange={set("cell")} disabled={Boolean(scope.cell)} className={input}><option value="">Not specific</option>{cells.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label className="block text-[11.5px] font-medium text-ink">Short title<input value={form.title} onChange={set("title")} placeholder="For example: three families missed the October payment" className={input} /></label>
        <label className="block text-[11.5px] font-medium text-ink">What did you find?<textarea value={form.note} onChange={set("note")} rows={4} className={`${input} resize-y`} /></label>
        {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-[11.5px] text-red-700"><AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />{error}</p>}
        {sent && <p role="status" className="flex items-start gap-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] p-2.5 text-[11.5px] text-[#067647]"><CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />Report {sent} was sent.</p>}
        <button type="submit" className="rounded-md bg-brand px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#524BE0]">Send report</button>
      </form></section>

    <section className="xl:col-span-2"><h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink"><TriangleAlert className="h-5 w-5 text-brand" />Reports from your area<span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-normal tabular-nums text-sub">{mine.length}</span></h2>
      {mine.length === 0 ? <div className="mt-3"><Empty>No reports yet. Reports from cell and sector leaders appear here.</Empty></div> : <ul className="mt-3 space-y-2.5">{mine.map((item) => <li key={item.id} className="rounded-xl border border-hairline bg-white p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-[13px] font-semibold text-ink">{item.title}</p><p className="mt-0.5 text-[11px] text-sub">{item.id} · {item.kind} · {item.sector}{item.cell ? ` · ${item.cell} cell` : ""} · {item.createdBy.name} ({item.createdBy.role.replace("gov_", "")} leader) · {ago(item.createdAt)}</p></div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === "Resolved" ? "bg-[#ECFDF3] text-[#067647]" : item.status === "Seen" ? "bg-[#EFEDFF] text-[#4B3FCC]" : "bg-[#FFFAEB] text-[#B54708]"}`}>{item.status}</span></div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{item.note}</p>
        {canUpdateIssue(scope, item) && <div className="mt-2.5 flex flex-wrap gap-2">{ISSUE_STATUSES.filter((status) => status !== item.status).map((status) => <button key={status} type="button" onClick={() => move(item, status)} className="rounded-md border border-hairline px-2.5 py-1 text-[11.5px] font-medium text-ink hover:bg-canvas">Mark as {status.toLowerCase()}</button>)}</div>}
        {item.history.length > 1 && <p className="mt-2 text-[10.5px] text-sub">Last update: {item.history.at(-1).by} marked it {item.history.at(-1).status.toLowerCase()} {ago(item.history.at(-1).at)}.</p>}
      </li>)}</ul>}
    </section>
  </div>;
}

// ---------------------------------------------------------------- Programme requests
export function GovRequests({ area, requests }) {
  const mine = requests.filter((item) => item.district === area.district).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className="space-y-3" data-judge="gov-requests">
    <div><h2 className="text-[20px] font-semibold tracking-tight text-ink">Programme requests in {area.district}</h2><p className="mt-0.5 text-[12px] text-sub">Requests sent to programme teams about this district, by analysts and by leaders, and what the teams answered.</p></div>
    {mine.length === 0 ? <Empty>No requests have been sent about {area.district}.</Empty> : <ul className="space-y-2.5">{mine.map((item) => <li key={item.id} className="rounded-xl border border-hairline bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-[13px] font-semibold text-ink">{item.title}</p><p className="mt-0.5 text-[11px] text-sub">{item.id} · {typeLabel(item.type)} · {short(item.programme)} · {item.priority} priority · asked by {item.createdBy.name} {ago(item.createdAt)}</p></div><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === "Completed" ? "bg-[#ECFDF3] text-[#067647]" : item.status === "Declined" ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#EFEDFF] text-[#4B3FCC]"}`}>{item.status}</span></div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink">{item.ask}</p>
      {item.outcome && <p className="mt-2 rounded-md bg-[#ECFDF3]/70 p-2.5 text-[12px] leading-relaxed text-ink"><span className="font-medium">Answer from {item.outcome.by}:</span> {item.outcome.note}</p>}
      {item.status === "Declined" && item.history.at(-1)?.note && <p className="mt-2 rounded-md bg-[#FEF3F2]/70 p-2.5 text-[12px] leading-relaxed text-ink"><span className="font-medium">Reason:</span> {item.history.at(-1).note}</p>}
    </li>)}</ul>}
  </div>;
}
