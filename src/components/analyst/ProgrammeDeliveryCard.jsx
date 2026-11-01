import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/analyst/Card";
import { DELIVERY_NOTE, deliverySummary } from "@/data/programmeDelivery";
import { useActionRequests } from "@/lib/actionRequests";

const TONE = { bad: "bg-[#FEF3F2] text-[#B42318]", warn: "bg-[#FFFAEB] text-[#B54708]", good: "bg-[#ECFDF3] text-[#067647]", mute: "bg-canvas text-sub" };
const pct = (value) => `${(value * 100).toFixed(0)}%`;

function Stat({ label, value, foot, tone = "text-ink" }) {
  return <div className="rounded-lg bg-canvas/70 p-3"><p className="text-[10.5px] text-sub">{label}</p><p className={`mt-1 text-[20px] font-semibold tabular-nums ${tone}`}>{value}</p><p className="mt-0.5 text-[10.5px] text-sub">{foot}</p></div>;
}

// Operational records from the Programme panel, next to survey poverty, so analysts can see where need and delivery do not line up.
export default function ProgrammeDeliveryCard({ rows, className = "" }) {
  const { requests } = useActionRequests();
  const [showAll, setShowAll] = useState(false);
  const summary = useMemo(() => deliverySummary(rows, requests), [rows, requests]);
  const ordered = useMemo(() => [...summary.items].sort((a, b) => a.signal.rank - b.signal.rank || b.row.poverty - a.row.poverty), [summary]);
  const visible = showAll ? ordered : ordered.slice(0, 8);
  const context = `Programme panel records (SAMPLE, ${DELIVERY_NOTE}) next to NISR EICV7 2023/24 poverty. ${ordered.map(({ row, delivery, signal }) => `${row.name}: poverty ${row.poverty.toFixed(1)}%; ${delivery.hasRecords ? `${delivery.enrolled} program members, October payments ${delivery.payments.failed} failed and ${delivery.payments.pending} pending of ${delivery.payments.total}, ${(delivery.enrolmentIssueShare * 100).toFixed(0)}% pending or suspended` : "no programme records"}; signal: ${signal.label}`).join("; ")}. Records are not coverage rates and do not prove programme success or failure.`;

  return <Card className={className} title="Programme delivery" subtitle="What programme records show next to poverty." inlineHelp
    info="Operational records from the Programme panel, shown next to EICV7 poverty. They are counts of people and payments in the programme registry, not coverage rates: no population denominator is available. A district with high poverty and no records is a question to investigate, not proof that nobody is supported. All programme figures here are sample data."
    aiInsight="Compare where poverty is high with where programme records and payment problems appear."
    aiContext={context}
    action={<span className="rounded-full border border-[#FEDF89] bg-[#FFFAEB] px-2 py-0.5 text-[10px] font-medium text-[#B54708]">Sample data</span>}>
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Stat label="Districts with records" value={`${summary.districtsWithRecords} of ${rows.length}`} foot="in this selection" />
      <Stat label="High poverty, none in sample" value={summary.gaps} foot="at or above the national rate" tone={summary.gaps ? "text-[#B42318]" : "text-ink"} />
      <Stat label="October payment problems" value={summary.paymentsTotal ? pct(summary.paymentProblemRate) : "None"} foot={summary.paymentsTotal ? `failed or pending, of ${summary.paymentsTotal} due` : "no payments in selection"} tone={summary.paymentProblemRate >= 0.1 ? "text-[#B54708]" : "text-ink"} />
      <Stat label="Districts with delivery flags" value={summary.flagged} foot="payment or enrolment issues" tone={summary.flagged ? "text-[#B54708]" : "text-ink"} />
    </div>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[11.5px]">
        <thead className="text-[10.5px] text-sub"><tr className="border-b border-hairline"><th className="py-2 pr-3 font-medium">District</th><th className="px-2 py-2 font-medium">Poverty</th><th className="px-2 py-2 font-medium">Program Members</th><th className="px-2 py-2 font-medium">Payment problems</th><th className="px-2 py-2 font-medium">Pending or suspended</th><th className="px-2 py-2 font-medium">Requests</th><th className="px-2 py-2 font-medium">Signal</th><th className="py-2 pl-2" /></tr></thead>
        <tbody>{visible.map(({ row, delivery, signal }) => <tr key={row.name} className="border-b border-hairline last:border-0">
          <td className="py-2.5 pr-3"><p className="font-medium text-ink">{row.name}</p><p className="text-[10px] text-sub">{row.province}</p></td>
          <td className="px-2 tabular-nums text-ink">{row.poverty.toFixed(1)}%</td>
          <td className="px-2 tabular-nums text-ink">{delivery.hasRecords ? delivery.enrolled : <span className="text-sub">none</span>}</td>
          <td className="px-2 tabular-nums">{delivery.hasRecords ? <span className={delivery.payments.problemRate >= 0.1 ? "font-medium text-[#B54708]" : "text-ink"}>{pct(delivery.payments.problemRate)} <span className="text-sub">({delivery.payments.failed + delivery.payments.pending}/{delivery.payments.total})</span></span> : <span className="text-sub">n/a</span>}</td>
          <td className="px-2 tabular-nums">{delivery.hasRecords ? <span className={delivery.enrolmentIssueShare >= 0.18 ? "font-medium text-[#B54708]" : "text-ink"}>{pct(delivery.enrolmentIssueShare)}</span> : <span className="text-sub">n/a</span>}</td>
          <td className="px-2 tabular-nums text-ink">{delivery.requests.open || delivery.requests.completed ? `${delivery.requests.open} open · ${delivery.requests.completed} done` : <span className="text-sub">none</span>}</td>
          <td className="px-2"><span className={`inline-block rounded-full px-2 py-1 text-[10px] font-medium ${TONE[signal.tone]}`}>{signal.label}</span></td>
          <td className="py-2 pl-2 text-right"><Link to={`/ai-engine?district=${encodeURIComponent(row.name)}`} className="whitespace-nowrap text-[11px] font-medium text-brand hover:underline">Open AI Engine →</Link></td>
        </tr>)}</tbody>
      </table>
    </div>
    {ordered.length > 8 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-2 text-[11px] font-medium text-brand hover:underline">{showAll ? "Show first 8" : `Show all ${ordered.length}`}</button>}
    <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">{DELIVERY_NOTE} Poverty is NISR EICV7 2023/24. Sorted by signal, then by poverty.</p>
  </Card>;
}
