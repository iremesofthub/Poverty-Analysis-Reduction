import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/analyst/Card";
import { DASHBOARD_SOURCES, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { intervalText, whiskerGeometry } from "@/lib/intervalWhisker";
import { coverage, rankCaution } from "@/lib/districtUncertainty";

const METRICS = {
  poverty: { label: "Poverty", max: 60, national: NATIONAL_EICV7.poverty, intervalKey: "povertyInterval" },
  extremePoverty: { label: "Extreme", max: 20, national: NATIONAL_EICV7.extremePoverty, intervalKey: "extremePovertyInterval" },
};

// The bar, plus a real 95% interval when the design-based artifact supplies one.
// No whisker is ever drawn from a guess: no interval means a plain bar.
function CertaintyBar(props) {
  const { x = 0, y = 0, width = 0, height = 11, payload, metric } = props;
  const interval = payload?.[METRICS[metric].intervalKey] ?? null;
  const whisker = whiskerGeometry({ barX: x, barY: y, barWidth: width, value: payload?.[metric], interval, thickness: height });
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={2} fill="#635BFF" />
      {whisker && (
        <g stroke="#0A2540" strokeOpacity={0.62} strokeWidth={1.4} strokeLinecap="round">
          <line {...whisker.axisLine} />
          <line {...whisker.lowCap} />
          <line {...whisker.highCap} />
        </g>
      )}
    </g>
  );
}

function ChartTip({ active = false, payload = [], metric, showCi }) {
  if (!active || !payload.length) return null;
  const row = payload[0].payload;
  const interval = row[METRICS[metric].intervalKey] ?? null;
  return (
    <div className="max-w-[240px] rounded-lg border border-hairline bg-white px-3 py-2 shadow-[0_8px_24px_rgba(10,37,64,0.12)]">
      <p className="text-[12px] font-semibold text-ink">{row.name}</p>
      <p className="mt-1 text-[11px] text-sub">{METRICS[metric].label}: <strong className="tabular-nums text-ink">{row[metric].toFixed(1)}%</strong> of people</p>
      {showCi && interval && (
        <p className="mt-1 text-[11px] tabular-nums text-ink">95% interval: {interval.low.toFixed(1)}–{interval.high.toFixed(1)}%</p>
      )}
      {showCi && !interval && <p className="mt-1 text-[11px] text-sub">95% interval: not available for this district</p>}
      {row.povertyEvidence && (
        <p className="mt-1 text-[10px] leading-snug text-sub">
          {row.povertyEvidence.samplePsus} survey clusters · reliability: {row.povertyEvidence.reliability}
        </p>
      )}
      <p className="mt-1 text-[10px] leading-snug text-sub">NISR EICV7, 2023/24 · {row.sampleHouseholds} surveyed households</p>
    </div>
  );
}

export default function PovertyByDistrictChart({ rows, province }) {
  const [metric, setMetric] = useState("poverty");
  const [showAll, setShowAll] = useState(false);
  const [showCi, setShowCi] = useState(true);
  const sorted = useMemo(() => [...rows].sort((a, b) => b[metric] - a[metric]), [rows, metric]);
  const visible = showAll ? sorted : sorted.slice(0, 10);
  const highest = sorted[0];
  const scope = province === "all" ? "Rwanda" : province;
  const intervalKey = METRICS[metric].intervalKey;
  const shown = coverage(visible.map((row) => (metric === "poverty" ? row : { ...row, povertyInterval: row[intervalKey] })));
  const nationalInterval = metric === "poverty" ? NATIONAL_EICV7.povertyInterval : null;

  const describedBy = visible.map((row) =>
    `${row.name} ${row[metric].toFixed(1)}%${showCi && row[intervalKey] ? ` (95% interval ${row[intervalKey].low.toFixed(1)} to ${row[intervalKey].high.toFixed(1)}%)` : ""}`
  ).join(", ");

  return (
    <Card
      title="Poverty by District"
      subtitle="See which districts have the highest poverty rates, and how sure each estimate is."
      info={`NISR EICV7 (2023/24): each bar is the share of people in that district below the poverty line, or the extreme poverty line when selected. Longer bars mean a higher rate, not a larger number of people. The whisker on each bar is the 95% confidence interval calculated from the survey design (stratified, cluster-weighted), so districts with wide whiskers have less certain estimates.`}
      aiInsight={`${highest.name} has the highest ${METRICS[metric].label.toLowerCase()} rate in ${scope} at ${highest[metric].toFixed(1)}%.${highest[intervalKey] ? ` Its 95% interval is ${highest[intervalKey].low.toFixed(1)}–${highest[intervalKey].high.toFixed(1)}%.` : ""} This is a survey estimate with sampling uncertainty, not a count of people.`}
      aiContext={`NISR EICV7, 2023/24. Geography: ${scope}. Measure: ${METRICS[metric].label} rate, percent of district residents (person-weighted universe). Rwanda reference: ${METRICS[metric].national.toFixed(1)}%${nationalInterval ? ` (95% interval ${nationalInterval.low.toFixed(1)}-${nationalInterval.high.toFixed(1)}%)` : ""}. Districts in current filter: ${sorted.map((row) => `${row.name} ${row[metric].toFixed(1)}%${row[intervalKey] ? ` [${row[intervalKey].low.toFixed(1)}-${row[intervalKey].high.toFixed(1)}]` : " [interval not available]"} (sample ${row.sampleHouseholds} households)`).join("; ")}. Source: ${DASHBOARD_SOURCES.poverty}. Intervals are design-based estimates from the repository survey engine and are not yet independently certified by NISR.`}
      inlineHelp
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md bg-[#F1F4F9] p-0.5">
            {Object.entries(METRICS).map(([key, value]) => (
              <button key={key} type="button" aria-pressed={metric === key} onClick={() => setMetric(key)}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${metric === key ? "bg-white text-ink shadow-sm" : "text-sub hover:text-ink"}`}>
                {value.label}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={showCi} onClick={() => setShowCi((value) => !value)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${showCi ? "border-brand/30 bg-brand/5 text-brand" : "border-hairline bg-white text-sub hover:text-ink"}`}>
            95% intervals
          </button>
        </div>
      }
    >
      <p className="mb-2 text-[11px] text-sub">
        Highest in {scope}: <span className="font-medium text-ink">{highest.name}, {highest[metric].toFixed(1)}%</span> · 2023/24
      </p>
      <div role="img" aria-label={`${METRICS[metric].label} rates for ${describedBy}`}>
        <ResponsiveContainer width="100%" height={Math.max(170, visible.length * 28 + 42)}>
          <BarChart data={visible} layout="vertical" margin={{ top: 2, right: 40, bottom: 2, left: 0 }} barCategoryGap="34%">
            <CartesianGrid horizontal={false} stroke="#EDF1F7" />
            <XAxis type="number" domain={[0, METRICS[metric].max]} ticks={metric === "poverty" ? [0, 20, 40, 60] : [0, 10, 20]}
              tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={83} interval={0} tick={{ fontSize: 10.5, fill: "#425466" }} axisLine={false} tickLine={false} />
            <ReferenceLine x={METRICS[metric].national} stroke="#8A94A6" strokeDasharray="3 3" />
            <Tooltip content={<ChartTip metric={metric} showCi={showCi} />} cursor={{ fill: "#F7F9FC" }} />
            <Bar dataKey={metric} fill="#635BFF" radius={[0, 3, 3, 0]} barSize={11}
              shape={showCi ? (props) => <CertaintyBar {...props} metric={metric} /> : undefined}>
              <LabelList dataKey={metric} position="right" formatter={(value) => `${Number(value).toFixed(1)}%`}
                style={{ fontSize: 10, fontWeight: 600, fill: "#0A2540" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#8A94A6]">
        <span>Dashed line: Rwanda {METRICS[metric].national.toFixed(1)}%{nationalInterval ? ` (${nationalInterval.low.toFixed(1)}–${nationalInterval.high.toFixed(1)}%)` : ""}</span>
        {sorted.length > 10 && (
          <button type="button" onClick={() => setShowAll((value) => !value)} className="font-medium text-brand hover:underline">
            {showAll ? "Show top 10" : `Show all ${sorted.length}`}
          </button>
        )}
      </div>
      {showCi && (
        <p className="mt-1 text-[10.5px] leading-snug text-[#8A94A6]">
          {shown.withInterval === shown.total
            ? "Whiskers show the 95% interval for every district in view."
            : `Whiskers appear on ${shown.withInterval} of ${shown.total} districts in view; the rest have no calculated interval.`}{" "}
          {rankCaution(visible.map((row) => ({ ...row, povertyInterval: row[intervalKey] })))}
        </p>
      )}
      <p className="mt-2 border-t border-hairline pt-2 text-[10.5px] text-[#8A94A6]">
        <a href={DASHBOARD_SOURCES.poverty} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: NISR EICV7</a> · 2023/24 · district residents.
        Intervals: <code className="text-[10px]">engine/ireme/survey.py</code> on the licensed microdata, pending independent scientific review.
      </p>
      <span className="sr-only">{intervalText(METRICS[metric].label, highest[intervalKey])}</span>
    </Card>
  );
}
