import React, { useMemo, useState } from "react";
import { ChevronDown, Eye, HeartPulse, UserX, Users, UsersRound } from "lucide-react";
import { HealthChip } from "@/components/government/GovCooperatives";
import { programmeCoops, useCooperatives } from "@/lib/cooperatives";
import { useProgrammeScope } from "@/lib/programmeScope";

const FILTERS = [["all", "All"], ["well", "Going well"], ["attention", "Struggling or inactive"]];

function Kpi({ icon: Icon, label, value, foot, warn }) {
  return <div className="rounded-xl border border-hairline bg-white px-4 py-3.5"><div className="flex items-center justify-between"><p className="text-[11.5px] font-medium text-sub">{label}</p><Icon className={`h-4 w-4 ${warn ? "text-[#B54708]" : "text-brand"}`} /></div><p className={`mt-1 text-[24px] font-semibold leading-none tracking-tight tabular-nums ${warn ? "text-[#B54708]" : "text-ink"}`}>{value}</p><p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p></div>;
}

// Read only. Cooperatives are run by sector and district leaders; a programme sees only its own beneficiaries' membership.
export default function CooperativesTab() {
  const scope = useProgrammeScope();
  const store = useCooperatives();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const view = useMemo(() => programmeCoops(store, scope.beneficiaries), [store, scope.beneficiaries]);
  const rows = view.rows.filter((row) => filter === "all" || (filter === "well" ? row.coop.health === "Going well" : row.coop.health !== "Going well"));
  const attentionMembers = view.rows.filter((row) => row.coop.health !== "Going well").reduce((sum, row) => sum + row.members.length, 0);
  const attentionCoops = view.rows.filter((row) => row.coop.health !== "Going well").length;
  const pct = view.total ? Math.round((view.inCoop / view.total) * 100) : 0;

  return <div className="space-y-4">
    <p className="flex items-start gap-2 rounded-lg border border-hairline bg-white p-3 text-[12px] leading-relaxed text-sub"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-brand" />Read only. Sector and district leaders run cooperatives and decide who joins. Here you see which cooperatives your own program members belong to, what each one is for, and how it is doing.</p>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" data-tour="coops-kpis">
      <Kpi icon={Users} label="In a cooperative" value={`${view.inCoop} of ${view.total}`} foot={`${pct}% of your program members`} />
      <Kpi icon={UsersRound} label="Cooperatives with your members" value={view.rows.length} foot="in the districts you serve" />
      <Kpi icon={HeartPulse} label="Need attention" value={attentionCoops} foot={`${attentionMembers} of your members affected`} warn={attentionCoops > 0} />
      <Kpi icon={UserX} label="Not in any cooperative" value={view.outside} foot="no cooperative record yet" />
    </div>
    <div className="flex flex-wrap gap-1.5" data-tour="coops-filters">{FILTERS.map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-full border px-3 py-1.5 text-[11.5px] font-medium ${filter === key ? "border-brand bg-brand-soft text-brand" : "border-hairline bg-white text-sub hover:text-ink"}`}>{label}</button>)}</div>
    {rows.length === 0 ? <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-10 text-center text-[12.5px] text-sub">{view.rows.length === 0 ? "None of your program members are in a cooperative yet." : "No cooperatives match this filter."}</p>
      : <ul className="space-y-2.5" data-tour="coops-list">{rows.map(({ coop, members }) => { const isOpen = open === coop.id; return <li key={coop.id} className="rounded-xl border border-hairline bg-white">
        <button type="button" onClick={() => setOpen(isOpen ? null : coop.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[13.5px] font-semibold text-ink">{coop.name}</h3><HealthChip health={coop.health} /></div><p className="mt-0.5 text-[11px] text-sub">{coop.activity} · {coop.sector}, {coop.district} · led by {coop.leader}</p><p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-ink">{coop.purpose}</p>{coop.health !== "Going well" && coop.healthNote && <p className="mt-2 rounded-md bg-[#FFFAEB] p-2 text-[11.5px] text-[#B54708]">{coop.healthNote}</p>}</div>
          <div className="flex shrink-0 items-center gap-3"><div className="text-right"><p className="text-[20px] font-semibold leading-none tabular-nums text-ink">{members.length}</p><p className="mt-1 text-[10.5px] text-sub">your members</p></div><ChevronDown className={`h-4 w-4 text-sub transition-transform ${isOpen ? "rotate-180" : ""}`} /></div>
        </button>
        {isOpen && <div className="border-t border-hairline px-4 py-3"><p className="text-[11px] text-sub">RWF {coop.monthlyRevenue.toLocaleString()} revenue a month · {coop.members} members in total · {coop.joinStatus === "Open" ? "accepting new members" : `joining is ${coop.joinStatus.toLowerCase()}`}</p>
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">{members.map((person) => <li key={person.id} className="flex items-center justify-between gap-2 rounded-md bg-canvas/70 px-3 py-2 text-[12px]"><span className="min-w-0 truncate font-medium text-ink">{person.name}</span><span className="shrink-0 text-[10.5px] text-sub">{person.sector} · {person.status}</span></li>)}</ul></div>}
      </li>; })}</ul>}
  </div>;
}
