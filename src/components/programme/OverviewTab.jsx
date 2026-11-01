import React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, Wallet, ShieldCheck, Briefcase, Award, Inbox } from "lucide-react";
import { requestStats, useActionRequests } from "@/lib/actionRequests";
import Card from "@/components/analyst/Card";
import { useProgrammeScope } from "@/lib/programmeScope";
import { programmeCoops, useCooperatives } from "@/lib/cooperatives";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";


function Kpi({ icon: Icon, label, value, foot, tone = "brand" }) {
  const tones = { brand: "bg-brand-soft text-brand", pos: "bg-[#ECFDF3] text-[#067647]", neg: "bg-[#FEF3F2] text-[#B42318]", ink: "bg-[#EFF2F7] text-ink" };
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
        <span className="text-[11.5px] font-medium text-sub">{label}</span>
      </div>
      <p className="mt-2 text-[22px] font-semibold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11px] text-[#8A94A6]">{foot}</p>
    </div>
  );
}

export default function OverviewTab({ onOpenTab }) {
  const { agents: AGENTS, beneficiaries: BENEFICIARIES, jobs: JOBS, awards: AWARDS, programmes: PROGRAMMES, skills, owns } = useProgrammeScope();
  const coopState = useCooperatives();
  const coopView = programmeCoops(coopState, BENEFICIARIES);
  const { requests: allRequests } = useActionRequests();
  const asks = requestStats(allRequests.filter((item) => owns(item.programme)));
  const skillDist = [...skills].sort((a, b) => b.beneficiaries - a.beneficiaries).slice(0, 7).map((item) => ({ name: item.name, count: item.beneficiaries }));
  const monthly = BENEFICIARIES.filter((b) => b.status === "Active").reduce((sum, b) => sum + (b.monthlyPayment || 0), 0);
  const districtCount = new Set(AGENTS.map((a) => a.district)).size;
  const activeAgents = AGENTS.filter((a) => a.status === "Active").length;
  const unpaidHealth = BENEFICIARIES.filter((b) => b.health.status !== "Paid").length;
  const openJobs = JOBS.filter((j) => j.status === "Open").length;

  return (
    <div className="space-y-4">
      {onOpenTab && asks.waiting > 0 && <button type="button" onClick={() => onOpenTab("requests")} data-tour="overview-review-requests" className="flex w-full items-center gap-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-left hover:bg-[#FFF6DB]"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#B54708]"><Inbox className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-ink">{asks.waiting} {asks.waiting === 1 ? "request" : "requests"} from analysts waiting for your decision</span><span className="block text-[11.5px] text-sub">Accept, assign or decline them. The analyst sees your answer.</span></span><span className="text-[12px] font-medium text-brand">Review</span></button>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3" data-tour="overview-kpis">
        <Kpi icon={Users} label="Agents" value={AGENTS.length} foot={`${activeAgents} active across ${districtCount} districts`} />
        <Kpi icon={Users} label="Program Members" value={BENEFICIARIES.length} foot={`${BENEFICIARIES.filter((b) => b.status === "Active").length} active`} />
        <Kpi icon={Wallet} label="Monthly payments due" value={`RWF ${(monthly / 1e6).toFixed(2)}M`} foot={`to ${BENEFICIARIES.filter((b) => b.status === "Active").length} active members`} tone="pos" />
        <Kpi icon={ShieldCheck} label="Health insurance" value={`${BENEFICIARIES.length - unpaidHealth}/${BENEFICIARIES.length}`} foot={`${unpaidHealth} need renewal`} tone={unpaidHealth > 0 ? "neg" : "pos"} />
        <Kpi icon={Briefcase} label="Open jobs" value={openJobs} foot={`${JOBS.length} total posted`} />
        <Kpi icon={Award} label="Awards given" value={AWARDS.length} foot="skills achievements recognised" tone="ink" />
      </div>

      {/* UPG-12 Surface B: the same four questions from the programme side, resolved against this account's role. */}
      <FeatureMiniEntry anchor="analysis-to-action" titleKey="discover.mini.fromAnalysisToAction" ids={["action-tracking", "vup-rules", "referral-followup"]} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Program Members by skill" subtitle="Top 7 trained skills" className="xl:col-span-2" data-tour="overview-skills-chart">
          {/* UPG-09: a reader who cannot see the bars gets the same numbers in words, and every reader gets the
              provenance line, so a panel record is never mistaken for a survey estimate. */}
          <div role="img" aria-label={`Program members by skill, highest first. ${skillDist.map((item) => `${item.name}: ${item.count} member${item.count === 1 ? "" : "s"}`).join(". ") || "No skills recorded for this programme."}`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={skillDist} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 20 }}>
                <CartesianGrid horizontal={false} stroke="#EDF1F7" />
                <XAxis type="number" tick={{ fontSize: 10.5, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10.5, fill: "#8A94A6" }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11 }} />
                <Bar dataKey="count" name="Program Members" fill="#635BFF" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-sub">Source: the {BENEFICIARIES.length} programme member records this panel holds, counted by skill. Demonstration panel records, not survey estimates.</p>
        </Card>

        <Card title="Programmes" subtitle="Active initiatives" bodyClassName="px-0 pb-0" data-tour="overview-programmes">
          <ul className="border-t border-hairline">
            {PROGRAMMES.map((p) => (
              <li key={p.name} className="flex items-center justify-between border-b border-hairline/70 px-5 py-2.5 last:border-0">
                <div>
                  <p className="text-[12px] font-medium text-ink">{p.name}</p>
                  <p className="text-[10.5px] text-sub">{p.beneficiaries} beneficiaries · {p.budget}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-medium ${p.status === "Active" ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]" : "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]"}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Cooperatives" subtitle={`${coopView.inCoop} of ${coopView.total} program members are in a cooperative`} data-tour="overview-cooperatives">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {coopView.rows.slice(0, 4).map(({ coop, members }) => (
              <div key={coop.id} className="rounded-lg border border-hairline px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink">{coop.name}</p>
                <p className="text-[10.5px] text-sub">{members.length} of your members · {coop.activity} · {coop.health}</p>
              </div>
            ))}
            {coopView.rows.length === 0 && <p className="text-[11.5px] text-sub">None of your program members are in a cooperative yet.</p>}
          </div>
          {onOpenTab && <button type="button" onClick={() => onOpenTab("cooperatives")} className="mt-3 text-[11.5px] font-medium text-brand hover:underline">See all cooperatives</button>}
        </Card>

        <Card title="Recent awards" subtitle="Skills achievements" data-tour="overview-awards">
          <ul className="space-y-2">
            {AWARDS.slice(0, 4).map((a, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ECFDF3] text-[#067647]">
                  <Award className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-ink">{a.beneficiary}</p>
                  <p className="text-[10.5px] text-sub">{a.type}</p>
                </div>
                <span className="text-[10.5px] text-[#8A94A6]">{a.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}