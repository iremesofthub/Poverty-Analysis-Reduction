import React, { useMemo, useState } from "react";
import Card from "@/components/analyst/Card";
import { DASHBOARD_SOURCES, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { districtDelivery } from "@/data/programmeDelivery";
import { contrastVerdict } from "@/lib/districtUncertainty";
import { isDistinguishableFromNational } from "@/lib/povertySupport";

export default function FlaggedDistrictsTable({ rows, onViewDistrict }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.poverty - a.poverty), [rows]);
  const visible = showAll ? sorted : sorted.slice(0, 6);

  return (
    <Card
      title="Priority Districts"
      subtitle="See which areas may need investigation first."
      inlineHelp
      info="Cards are ordered only by the observed 2023/24 district poverty rate. This is a transparent viewing order, not a priority score, eligibility decision, or finding that a programme failed. VUP participation among surveyed poor households provides a separate question for investigation. Where a joint survey contrast against Rwanda exists, a district whose difference falls inside sampling uncertainty is labelled as such instead of being treated as high."
      aiInsight="Start with the highest observed poverty rates, then inspect local context, survey uncertainty, eligibility, and other support before making a decision."
      aiContext={`NISR EICV7 2023/24. Cards rank only by district poverty rate in the current filter, with no composite priority score. Poverty is percent of people; VUP is reported participation among surveyed poor households, not all social support or eligibility. Ranked districts: ${sorted.map((row, index) => `${index + 1}. ${row.name} (${row.province}): poverty ${row.poverty.toFixed(1)}%${row.povertyInterval ? ` [95% CI ${row.povertyInterval.low.toFixed(1)}-${row.povertyInterval.high.toFixed(1)}]` : " [interval not available]"}, VUP ${row.vupAmongPoor.toFixed(1)}% of ${row.samplePoorHouseholds} surveyed poor households, ${contrastVerdict(row.povertyContrast).label.toLowerCase()}`).join("; ")}. National poverty ${NATIONAL_EICV7.poverty.toFixed(1)}%${NATIONAL_EICV7.povertyInterval ? ` [95% CI ${NATIONAL_EICV7.povertyInterval.low.toFixed(1)}-${NATIONAL_EICV7.povertyInterval.high.toFixed(1)}]` : ""}. Ranking is for investigation and does not prove programme failure. Intervals are design-based estimates from the repository survey engine, pending independent scientific review.`}
    >
      <p className="mb-3 text-[10.5px] text-sub">Ranked by EICV7 poverty rate within the current filter · no composite score</p>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((row, index) => {
          const lowSample = row.samplePoorHouseholds < 50;
          const delivery = districtDelivery(row.name);
          const distinguishable = isDistinguishableFromNational(row);
          const verdict = contrastVerdict(row.povertyContrast);
          const reason = index === 0
            ? "Highest observed poverty in this selection"
            : row.poverty > NATIONAL_EICV7.poverty
              ? distinguishable ? "Poverty estimate above the national rate" : "Point estimate above national, but within sampling uncertainty"
              : "Included for comparison in this selection";
          return (
            <li key={row.name} className="rounded-lg border border-hairline bg-canvas/50 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div><span className="text-[10px] font-medium text-[#8A94A6]">#{index + 1} · {row.province}</span><h3 className="mt-0.5 text-[13px] font-semibold text-ink">{row.name}</h3></div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${lowSample ? "bg-[#FFFAEB] text-[#B54708]" : distinguishable ? "bg-brand-soft text-brand" : "bg-[#F1F4F9] text-sub"}`}>
                  {lowSample ? "Small sample" : distinguishable ? "Review" : "Within range"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-2.5">
                <div>
                  <p className="text-[10px] text-sub">Poverty · people</p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">{row.poverty.toFixed(1)}%</p>
                  <p className="text-[10px] tabular-nums text-[#8A94A6]">{row.povertyInterval ? `${row.povertyInterval.low.toFixed(1)}–${row.povertyInterval.high.toFixed(1)}% (95%)` : "interval not available"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-sub">VUP · poor HH</p>
                  <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">{row.vupAmongPoor.toFixed(1)}%</p>
                  <p className="text-[10px] tabular-nums text-[#8A94A6]">{row.vupInterval ? `${row.vupInterval.low.toFixed(1)}–${row.vupInterval.high.toFixed(1)}% (95%)` : "interval not available"}</p>
                </div>
              </div>
              <p className="mt-2 min-h-8 text-[10.5px] leading-snug text-sub">{reason}. {lowSample ? `Only ${row.samplePoorHouseholds} surveyed poor households.` : "Check local context before action."}</p>
              <p className="mt-1 text-[10.5px] leading-snug text-sub"><span className="font-medium text-ink">{verdict.label}:</span> {verdict.detail}</p>
              <p className="mt-1 text-[10.5px] leading-snug text-sub"><span className="font-medium text-ink">Programme records (sample):</span> {delivery.hasRecords ? `${delivery.enrolled} program members${delivery.payments.problemRate >= 0.1 ? `, ${(delivery.payments.problemRate * 100).toFixed(0)}% of October payments had a problem` : ""}` : "none in the sample registry"}</p>
              <button type="button" onClick={() => onViewDistrict(row.name)} className="mt-2 text-[11px] font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">
                View comparison →
              </button>
            </li>
          );
        })}
      </ol>
      {sorted.length > 6 && <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 text-[11px] font-medium text-brand hover:underline">{showAll ? "Show first 6" : `Show all ${sorted.length}`}</button>}
      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        <a href={DASHBOARD_SOURCES.poverty} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: NISR EICV7</a> · 2023/24 district estimates. VUP figures are calculated from the supplied cross-section. Cards do not measure all support or prove that a district needs a particular programme.
      </p>
    </Card>
  );
}
