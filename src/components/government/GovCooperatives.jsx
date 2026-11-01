import React, { useMemo, useState } from "react";
import { Eye, HeartPulse, Inbox, Users, UsersRound } from "lucide-react";
import SidePanel from "@/components/investigation/SidePanel";
import { useDemoAuth } from "@/lib/DemoAuthContext";
import { useAuth } from "@/lib/AuthContext";
import { leaderScope, useCooperatives } from "@/lib/cooperatives";
import { ago } from "@/components/requests/bits";
import { useTranslation } from "react-i18next";
import { Phone } from "lucide-react";
import { useCoopLeadersByName } from "@/lib/govApi";

// The leaders of a cooperative, read-only, from the database.
function Leaders({ coop }) {
  const { t } = useTranslation();
  const { data: leaders } = useCoopLeadersByName(coop.name, coop.district);
  if (!leaders) return null;
  return <section data-tour="gov-coop-leaders"><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">{t("member.coops.leaders")}</h3>{leaders.length === 0 ? <p className="mt-2 text-[12px] text-sub">{t("gov.noLeaders")}</p> : <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">{leaders.map((person) => <li key={person.member_id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12px]"><span><span className="font-medium text-ink">{person.full_name}</span><span className="block text-[11px] text-sub">{t(`member.coops.roles.${person.coop_role}`)}</span></span>{person.phone && <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 text-brand"><Phone className="h-3 w-3" aria-hidden="true" />{person.phone}</a>}</li>)}</ul>}</section>;
}

const HEALTH_STYLE = { "Going well": "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]", Struggling: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]", Inactive: "border-[#FEE4E2] bg-[#FEF3F2] text-[#B42318]" };
const JOIN_STYLE = { Open: "text-[#067647]", Full: "text-[#B54708]", Closed: "text-sub" };
const short = (name) => ({ "VUP Direct Support": "VUP", "Girinka Munyarwanda": "Girinka", "Expanded Public Works": "Public Works", "Nsymibondo y'Icyaro": "Nsymibondo" }[name] || name);

export const HealthChip = ({ health }) => {
  const { t } = useTranslation();
  return <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${HEALTH_STYLE[health]}`}>{t(`coopHealth.${health}`, { defaultValue: health })}</span>;
};

function Kpi({ icon: Icon, label, value, foot, warn }) {
  return <div className="rounded-xl border border-hairline bg-white px-4 py-3.5"><div className="flex items-center gap-2 text-sub"><Icon className="h-4 w-4" strokeWidth={1.9} /><span className="text-[11.5px] font-medium">{label}</span></div><p className={`mt-1.5 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${warn ? "text-[#B54708]" : "text-ink"}`}>{value}</p><p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p></div>;
}

function Detail({ coop, store, onClose }) {
  const members = store.membersOf(coop.id);

  return <SidePanel overlay title={coop.name} subtitle={`${coop.sector}, ${coop.district} · ${coop.activity}`} icon={UsersRound} onClose={onClose} actions={<HealthChip health={coop.health} />}>
    <div className="space-y-5 p-4">
      <p className="flex items-center gap-2 rounded-md border border-hairline bg-canvas/60 p-2.5 text-[11.5px] text-sub"><Eye className="h-3.5 w-3.5 shrink-0" />View only. The cooperative manages its own members and details.</p>
      <section><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">Main purpose</h3><p className="mt-1 text-[12.5px] leading-relaxed text-ink">{coop.purpose || "Not written yet."}</p><p className="mt-2 text-[11.5px] text-sub">Led by {coop.leader || "not set"} · founded {coop.founded} · {coop.verified ? "verified" : "not yet verified"} · RWF {coop.monthlyRevenue.toLocaleString()} a month · {coop.members} members reported</p></section>

      <Leaders coop={coop} />

      <section className="rounded-xl border border-hairline bg-canvas/50 p-3.5"><h3 className="text-[12.5px] font-semibold text-ink">How is it doing?</h3>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-ink"><HealthChip health={coop.health} /><span className="text-sub">{coop.joinStatus === "Open" ? "Accepting new members" : `New members: ${coop.joinStatus.toLowerCase()}`}</span></p>
        {coop.healthNote && <p className="mt-2 text-[12px] leading-relaxed text-ink">{coop.healthNote}</p>}
      </section>

      <section><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">Program Members in this cooperative ({members.length})</h3>
        {members.length === 0 ? <p className="mt-2 text-[12px] text-sub">No registered program members are members yet.</p> : <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline">{members.map((link) => <li key={link.beneficiaryId} className="px-3 py-2"><p className="truncate text-[12.5px] font-medium text-ink">{link.person.name}</p><p className="text-[10.5px] text-sub">{link.person.sector} · {short(link.person.programme)} programme · since {new Date(link.since).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</p></li>)}</ul>}
      </section>
      <section><h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-sub">Recent activity</h3><ul className="mt-2 space-y-2">{(coop.log || []).slice(0, 8).map((entry, index) => <li key={`${entry.at}-${index}`} className="text-[11.5px] leading-relaxed text-ink"><span className="text-sub">{ago(entry.at)} · {entry.by}:</span> {entry.text}</li>)}</ul></section>
    </div>
  </SidePanel>;
}

export default function GovCooperatives() {
  const { demoUser } = useDemoAuth();
  const { profile } = useAuth();
  const scope = leaderScope(demoUser, profile);
  const store = useCooperatives();
  const allDistricts = useMemo(() => [...new Set(store.coops.map((coop) => coop.district))].sort(), [store.coops]);
  const [districtChoice, setDistrictChoice] = useState("Nyaruguru");
  const district = scope.all ? districtChoice : scope.district;
  const [openId, setOpenId] = useState(null);

  const coops = store.coops.filter((coop) => coop.district === district && (!scope.sector || coop.sector === scope.sector));
  const ids = new Set(coops.map((coop) => coop.id));
  const waiting = store.requests.filter((item) => ["Pending", "Endorsed"].includes(item.status) && ids.has(item.coopId));
  const memberTotal = coops.reduce((sum, coop) => sum + store.membersOf(coop.id).length, 0);
  const attention = coops.filter((coop) => coop.health !== "Going well").length;
  const selected = coops.find((coop) => coop.id === openId);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[20px] font-semibold tracking-tight text-ink">Cooperatives in your area</h2><p className="mt-0.5 text-[12px] text-sub">You can see the cooperatives in {scope.sector ? `${scope.sector} sector` : district}, how they are doing and how many beneficiaries belong to them. Each cooperative accepts its own members and keeps its own details.</p></div>
      {scope.all && <select value={districtChoice} onChange={(event) => setDistrictChoice(event.target.value)} aria-label="District" className="rounded-md border border-hairline bg-white px-3 py-2 text-[12.5px] outline-none focus:border-brand">{allDistricts.map((name) => <option key={name}>{name}</option>)}</select>}</div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi icon={UsersRound} label="Cooperatives" value={coops.length} foot={`${coops.filter((coop) => coop.joinStatus === "Open").length} accepting members`} />
      <Kpi icon={Users} label="Program Members in the cooperative" value={memberTotal} foot="registered on the platform" />
      <Kpi icon={Inbox} label="Join requests waiting" value={waiting.length} foot="with the cooperatives" />
      <Kpi icon={HeartPulse} label="Need attention" value={attention} foot="struggling or inactive" warn={attention > 0} />
    </div>

    {coops.length === 0 ? <p className="rounded-xl border border-dashed border-hairline bg-white px-4 py-10 text-center text-[12.5px] text-sub">No cooperatives are registered {scope.sector ? `in ${scope.sector} sector` : `in ${district}`} yet.</p>
      : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{coops.map((coop) => <button key={coop.id} type="button" onClick={() => setOpenId(coop.id)} className="rounded-xl border border-hairline bg-white p-4 text-left transition-colors hover:border-brand/40">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-[13.5px] font-semibold text-ink">{coop.name}</h3><p className="text-[11px] text-sub">{coop.sector} · {coop.activity}</p></div><HealthChip health={coop.health} /></div>
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-sub">{coop.purpose}</p>
        <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2.5 text-[11px]"><span className="text-ink"><strong className="tabular-nums">{store.membersOf(coop.id).length}</strong> program member members</span><span className={`font-medium ${JOIN_STYLE[coop.joinStatus]}`}>{coop.joinStatus === "Open" ? "Accepting members" : coop.joinStatus}</span></div>
      </button>)}</div>}

    {selected && <Detail key={selected.id} coop={selected} store={store} onClose={() => setOpenId(null)} />}
  </div>;
}
