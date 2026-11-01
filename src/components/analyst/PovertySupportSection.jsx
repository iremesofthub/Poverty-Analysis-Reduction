import React, { useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import Card from "@/components/analyst/Card";
import CompareChart from "@/components/analyst/support/CompareChart";
import PriorityScatter from "@/components/analyst/support/PriorityScatter";
import DistrictsTable from "@/components/analyst/support/DistrictsTable";
import DistrictPanel from "@/components/analyst/support/DistrictPanel";
import InfoTip, { HELP } from "@/components/analyst/support/InfoTip";
import { DASHBOARD_SOURCES, EICV7_METHOD, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { contrastVerdict, coverage } from "@/lib/districtUncertainty";
import { enrichRows, viewToCsv } from "@/lib/povertySupport";

const VIEWS = [
  { key: "compare", label: "Compare" },
  { key: "prioritize", label: "Prioritize" },
  { key: "districts", label: "Districts" },
];
const VIEW_STORAGE = "poverty-support-view";

const readView = () => {
  try {
    const saved = sessionStorage.getItem(VIEW_STORAGE);
    return VIEWS.some((view) => view.key === saved) ? saved : "prioritize";
  } catch { return "prioritize"; }
};

export default function PovertySupportSection({ rows, province, selectedName, onSelect, className = "" }) {
  const [view, setViewState] = useState(readView);
  const [showMethod, setShowMethod] = useState(false);
  const national = NATIONAL_EICV7;
  const data = useMemo(() => enrichRows(rows, national), [rows, national]);
  const selected = data.find((row) => row.name === selectedName) || null;
  const reviewList = useMemo(() => data.filter((row) => row.quadrant.key === "reviewFirst" && row.marker.key !== "smallSample" && row.marker.key !== "withinRange").sort((a, b) => b.poverty - a.poverty), [data]);
  const covered = coverage(data);
  // States actual coverage of the current selection instead of claiming intervals
  // for districts whose estimate could not be reconciled.
  const intervalSummary = covered.withInterval
    ? `Design-based 95% intervals, calculated with this repository's survey engine from the EICV7 strata and PSUs, cover ${covered.withInterval} of ${covered.total} districts here and ${covered.withContrast} have a tested difference from Rwanda. They are pending independent scientific review.`
    : "District samples are small and confidence intervals were not calculated for this selection.";

  const setView = (key) => {
    setViewState(key);
    try { sessionStorage.setItem(VIEW_STORAGE, key); } catch { /* The view still changes without storage. */ }
  };
  const onTabKey = (event) => {
    const index = VIEWS.findIndex((item) => item.key === view);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = VIEWS[(next + VIEWS.length) % VIEWS.length].key;
    setView(target);
    requestAnimationFrame(() => document.getElementById(`support-tab-${target}`)?.focus());
  };
  const exportView = () => {
    const url = URL.createObjectURL(new Blob(["﻿", viewToCsv(data, national)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `poverty-social-support-${view}-${province === "all" ? "rwanda" : province.toLowerCase().replace(/\s+/g, "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const aiContext = `NISR EICV7 2023/24. Poverty is percent of district residents; VUP is household-weighted reported participation in any VUP component among surveyed poor households. Different denominators; do not subtract. National poverty ${national.poverty.toFixed(1)}%; national VUP participation among poor households ${national.vupAmongPoor.toFixed(1)}%. Districts in current filter: ${data.map((row) => `${row.name}: poverty ${row.poverty.toFixed(1)}%${row.povertyInterval ? ` [95% CI ${row.povertyInterval.low.toFixed(1)}-${row.povertyInterval.high.toFixed(1)}]` : " [interval not available]"}, VUP ${row.vupAmongPoor.toFixed(1)}% of ${row.samplePoorHouseholds} surveyed poor households${row.vupInterval ? ` [95% CI ${row.vupInterval.low.toFixed(1)}-${row.vupInterval.high.toFixed(1)}]` : ""}, ${contrastVerdict(row.povertyContrast).label.toLowerCase()}`).join("; ")}. VUP participation does not measure all social support, eligibility, or actual payments. Intervals are design-based (strata, PSUs, subpopulation variance) from the repository survey engine and are pending independent scientific review; ranking by point estimates is not a certified order.`;

  return (
    <Card
      title="Poverty & Social Support"
      subtitle="Where is poverty highest, and how widely does VUP reach poor households?"
      className={className}
      inlineHelp
      info="Each dot or row is a district. Poverty is the share of people below the EICV7 poverty line. VUP participation is the share of surveyed poor households that report taking part in a VUP programme. These count different groups, so never subtract one from the other. 'Review first' only means poverty is above the national rate while reported VUP participation is below its national rate. Where a joint survey contrast against Rwanda exists and includes zero, the district is marked 'within national range' instead. It does not show that support is missing or that a programme has failed."
      aiInsight="Use the two measures as separate observations. Survey participation does not measure all social support or whether eligible households received the right service."
      aiContext={aiContext}
      action={<button type="button" onClick={exportView} disabled={!data.length} className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-sub hover:bg-canvas hover:text-ink disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand" aria-label="Export this view as CSV"><Download className="h-3 w-3" aria-hidden="true" />CSV</button>}
    >
      <p className="-mt-1 mb-3 flex flex-wrap items-center gap-x-1 text-[11px] text-sub">
        Indicators: <span className="inline-flex items-center">Poverty rate<InfoTip label="Poverty rate">{HELP.poverty}</InfoTip></span>
        <span className="inline-flex items-center">VUP participation<InfoTip label="VUP participation among poor households">{HELP.vup}</InfoTip></span>
        <span className="inline-flex items-center">Sample size<InfoTip label="Sample size">{HELP.sample}</InfoTip></span>
        <span className="inline-flex items-center">Confidence interval<InfoTip label="Confidence interval">{HELP.interval}</InfoTip></span>
        <span className="inline-flex items-center">National reference<InfoTip label="National reference">{HELP.national}</InfoTip></span>
      </p>

      <div role="tablist" aria-label="Chart view" data-tour="support-views" onKeyDown={onTabKey} className="mb-4 inline-flex rounded-md bg-[#F1F4F9] p-0.5">
        {VIEWS.map((item) => (
          <button key={item.key} id={`support-tab-${item.key}`} role="tab" type="button" aria-selected={view === item.key} aria-controls="support-panel"
            tabIndex={view === item.key ? 0 : -1} onClick={() => setView(item.key)}
            className={`rounded px-3 py-1 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand ${view === item.key ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div id="support-panel" role="tabpanel" aria-labelledby={`support-tab-${view}`}>
        {data.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline p-6 text-center text-[12px] text-sub">No district data is available for this selection.</p>
        ) : view === "compare" ? (
          <CompareChart rows={data} national={national} selectedName={selected?.name} onSelect={onSelect} />
        ) : view === "districts" ? (
          <DistrictsTable rows={data} selectedName={selected?.name} onSelect={onSelect} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div data-tour="support-scatter" className="min-w-0"><PriorityScatter rows={data} national={national} selectedName={selected?.name} onSelect={onSelect} /></div>
            <DistrictPanel row={selected} national={national} reviewList={reviewList} onSelect={onSelect} />
          </div>
        )}
        {view !== "prioritize" && selected && data.length > 0 && (
          <div className="mt-4"><DistrictPanel row={selected} national={national} reviewList={[]} onSelect={onSelect} /></div>
        )}
      </div>

      <div className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        <p>
          <a href={DASHBOARD_SOURCES.poverty} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: NISR EICV7</a> · 2023/24 survey. Poverty uses the January 2024 poverty line. VUP participation is reported participation among surveyed poor households, calculated with household weights. {intervalSummary}
        </p>
        <button type="button" onClick={() => setShowMethod((value) => !value)} aria-expanded={showMethod} aria-controls="support-method" className="mt-1 inline-flex items-center gap-1 font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">
          Methodology &amp; limitations<ChevronDown className={`h-3 w-3 transition-transform ${showMethod ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {showMethod && (
          <ul id="support-method" className="mt-1.5 list-disc space-y-1 pl-4 text-sub">
            <li><strong className="font-medium text-ink">Poverty:</strong> {EICV7_METHOD.poverty}</li>
            <li><strong className="font-medium text-ink">VUP:</strong> {EICV7_METHOD.vupAmongPoor}</li>
            <li><strong className="font-medium text-ink">Uncertainty:</strong> {EICV7_METHOD.uncertainty}</li>
            <li>Poverty counts people and VUP counts poor households. Their numbers cannot be subtracted to find a coverage gap.</li>
            <li>National lines use the same definitions and survey period ({national.sampleHouseholds.toLocaleString()} households, {national.samplePoorHouseholds.toLocaleString()} poor households sampled).</li>
            <li>“Small sample” means fewer than 50 surveyed poor households. This is a dashboard display rule, not an NISR threshold.</li>
            <li>Low VUP participation does not prove a programme failed. Eligibility, targeting rules and reporting can differ between districts.</li>
          </ul>
        )}
      </div>
    </Card>
  );
}
