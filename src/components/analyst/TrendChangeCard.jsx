import React, { useMemo, useState } from "react";
import { CartesianGrid, Legend as ChartLegend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/analyst/Card";
import DataNote from "@/components/analyst/support/DataNote";
import { Basis, Legend, Segmented, ViewTable, tooltipStyle } from "@/components/analyst/TrendBits";
import { TREND_CHANGE_COUNTS, TREND_DISTRICTS, TREND_NATIONAL, TREND_PERIODS, TREND_SOURCES } from "@/data/dashboardTrends";

const COLORS = { improve: "#635BFF", worsen: "#F5A623", none: "#A3ADBD" };
const NATIONAL_LINE = [
  { period: "2010/11", oldMethod: TREND_NATIONAL.oldSeries[0].published },
  { period: "2013/14", oldMethod: TREND_NATIONAL.oldSeries[1].published },
  { period: "2016/17", oldMethod: TREND_NATIONAL.oldSeries[2].published, currentMethod: TREND_NATIONAL.modelled2016_17 },
  { period: "2023/24", currentMethod: TREND_NATIONAL.eicv7 },
];
function Eicv3Note() {
  const check = TREND_NATIONAL.checks.find((item) => item.round === "EICV3");
  const series = TREND_NATIONAL.oldSeries[0];
  return (
    <>
      <p>The 2010/11 point on this chart is NISR's published <strong>{check.published.toFixed(1)}%</strong>. Recalculated from the supplied EICV3 microdata we get <strong>{check.calculated.toFixed(1)}%</strong> (95% interval {series.ci_lower.toFixed(1)} to {series.ci_upper.toFixed(1)}).</p>
      <p className="mt-1.5">The published figure sits inside our interval, so the two agree within survey error, but they do not match exactly as 2013/14 and 2016/17 do. The file NISR supplied is named a January 2014 re-estimate, which is the most likely reason; we have not confirmed this with NISR.</p>
      <p className="mt-1.5">Read small district changes between 2010/11 and 2013/14 with care.</p>
    </>
  );
}
const kind = (label = "") => label.startsWith("Clear improvement") ? "improve" : label.startsWith("Clear worsening") ? "worsen" : label.startsWith("Possible") ? (label.includes("worsening") ? "worsen" : "improve") : "none";
const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

// One string per series, used both for the drawn legend and for the chart's textual alternative, so a
// reader who cannot see the lines can still match each number to the line it belongs to.
const OLD_SERIES = "Old method (published)";
const CURRENT_SERIES = "Current method (2016/17 modelled by NISR)";
const seriesSpoken = (key) => NATIONAL_LINE.filter((item) => item[key] !== undefined && item[key] !== null)
  .map((item) => `${item.period} ${item[key]}`).join("; ");

export default function TrendChangeCard({ rows }) {
  const [period, setPeriod] = useState("2013_14_to_2016_17");
  const [showAll, setShowAll] = useState(false);
  const names = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const sorted = useMemo(() => TREND_DISTRICTS.filter((row) => names.has(row.name) && row.changes[period]).sort((a, b) => a.changes[period].points - b.changes[period].points), [names, period]);
  const visible = showAll ? sorted : sorted.slice(0, 8);
  const limit = Math.ceil(Math.max(...TREND_DISTRICTS.flatMap((row) => Object.values(row.changes).filter(Boolean).flatMap((item) => [Math.abs(item.ci_lower), Math.abs(item.ci_upper)]))) / 10) * 10;
  const place = (value) => `${50 + (value / limit) * 50}%`;
  const counts = TREND_CHANGE_COUNTS[period];
  const info = TREND_PERIODS[period];

  return (
    <Card
      title="Poverty Trends 2010/11 to 2016/17"
      tour="analysis-trends"
      subtitle="See which districts clearly improved or worsened, with the uncertainty shown."
      info="Each dot is the change in a district's poverty rate between two surveys, in percentage points. The thin line is the 95% interval: if it crosses zero, the survey cannot tell a real change from chance. A change is called clear only after allowing for comparing 30 districts at once. Different households are interviewed in each survey, so this describes change and does not explain it."
      aiInsight={`${counts.clearImprovement} districts clearly improved and ${counts.clearWorsening} clearly worsened between ${info.label}; ${counts.noClearChange + counts.possible} show no clear change.`}
      aiContext={`NISR EICV3, EICV4 and EICV5 poverty files, same poverty method, 30 districts, aggregate estimates with 95% intervals. Period ${info.label}. ${sorted.map((row) => `${row.name}: ${signed(row.changes[period].points)} points (${row.changes[period].ci_lower.toFixed(1)} to ${row.changes[period].ci_upper.toFixed(1)}), ${row.changes[period].label}`).join("; ")}. Clear means significant after Holm adjustment across 30 districts. The EICV3 file is a January 2014 re-estimate (46.0% nationally vs 44.9% published) so changes from 2010/11 are indicative. Separate survey samples; no causes can be inferred. Source: ${TREND_SOURCES.nationalSeries}.`}
      inlineHelp
    >
      <Basis />
      <Segmented label="Period shown by district" value={period} onChange={(key) => { setPeriod(key); setShowAll(false); }} options={Object.entries(TREND_PERIODS).map(([key, value]) => ({ key, label: value.label }))} />
      <div className="mt-3" role="img" aria-label={`National poverty rate as two lines. ${OLD_SERIES}: ${seriesSpoken("oldMethod")}. ${CURRENT_SERIES}: ${seriesSpoken("currentMethod")}.`}>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={NATIONAL_LINE} margin={{ top: 8, right: 16, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="#EDF1F7" />
            <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 60]} ticks={[0, 20, 40, 60]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value, name) => [`${value}%`, name]} contentStyle={tooltipStyle} />
            <ChartLegend iconType="plainline" wrapperStyle={{ fontSize: 10.5, color: "#425466" }} />
            <Line type="linear" dataKey="oldMethod" name={OLD_SERIES} stroke="#A3ADBD" strokeWidth={2} dot={{ r: 4, fill: "#A3ADBD", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            <Line type="linear" dataKey="currentMethod" name={CURRENT_SERIES} stroke="#635BFF" strokeWidth={2} dot={{ r: 4, fill: "#635BFF", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10.5px] text-[#8A94A6]">Rwanda, % of people. NISR changed the poverty method for EICV7, so the two lines are not joined. <DataNote label="2010/11 national figure"><Eicv3Note /></DataNote></p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-sub"><strong className="text-ink">{info.label}:</strong> {counts.clearImprovement} clearly improved · {counts.clearWorsening} clearly worsened · {counts.possible} possible · {counts.noClearChange} no clear change (of 30 districts)</p>
      </div>
      <div className="mt-2"><Legend items={[{ label: "Clear or possible improvement", color: COLORS.improve }, { label: "Clear or possible worsening", color: COLORS.worsen }, { label: "No clear change", color: COLORS.none }, { label: "Hollow dot: possible, not robust to 30 comparisons", color: "#425466", hollow: true }]} /></div>
      <ol className="mt-2 divide-y divide-hairline/70">
        {visible.map((row) => {
          const change = row.changes[period];
          const tone = COLORS[kind(change.label)];
          const possible = change.label.startsWith("Possible");
          return (
            <li key={row.name} className="grid grid-cols-[78px_minmax(80px,1fr)_96px] items-center gap-2 py-2 sm:grid-cols-[110px_minmax(100px,1fr)_150px] sm:gap-3"
              aria-label={`${row.name}: ${signed(change.points)} percentage points, 95% interval ${change.ci_lower.toFixed(1)} to ${change.ci_upper.toFixed(1)}, ${change.label}`}>
              <span className="break-words text-[11px] font-medium leading-tight text-ink sm:text-[12px]">{row.name}</span>
              <div className="relative h-5" title={`${signed(change.points)} points (${change.ci_lower.toFixed(1)} to ${change.ci_upper.toFixed(1)}) · ${change.label}`}>
                <div className="absolute left-1/2 top-0 h-5 w-px bg-[#C9D1DC]" />
                <div className="absolute top-[9px] h-[2px] rounded bg-[#C9D1DC]" style={{ left: place(change.ci_lower), width: `${((change.ci_upper - change.ci_lower) / limit) * 50}%` }} />
                <span className={`absolute top-[4px] h-3 w-3 -translate-x-1/2 rounded-full border-2 ${possible ? "bg-white" : "border-white shadow-[0_0_0_1px_var(--dot)]"}`}
                  style={{ left: place(change.points), "--dot": tone, backgroundColor: possible ? "#fff" : tone, borderColor: possible ? tone : "#fff" }} />
              </div>
              <span className="text-right text-[10.5px] tabular-nums text-ink sm:text-[11.5px]">
                <span className="block font-medium">{signed(change.points)} pt</span>
                <span className="text-sub">{change.label.replace(" (not robust to testing 30 districts)", "")}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between text-[10px] text-[#8A94A6]"><span>← poverty fell</span><span>0</span><span>poverty rose →</span></div>
      {sorted.length > 8 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-2 text-[11px] font-medium text-brand hover:underline">
          {showAll ? "Show the 8 largest falls" : `Show all ${sorted.length} districts`}
        </button>
      )}
      <ViewTable head={["District", `${info.from} %`, `${info.to} %`, "Change (points)", "95% interval", "Result"]}
        rows={sorted.map((row) => { const [fromKey, toKey] = period === "2010_11_to_2013_14" ? ["eicv3", "eicv4"] : ["eicv4", "eicv5"]; const change = row.changes[period]; return [row.name, row.rates[fromKey]?.pct.toFixed(1) ?? "–", row.rates[toKey]?.pct.toFixed(1) ?? "–", signed(change.points), `${change.ci_lower.toFixed(1)} to ${change.ci_upper.toFixed(1)}`, change.label]; })} />
      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        <a href={TREND_SOURCES.nationalSeries} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: NISR EICV7 Main Indicators Report</a> for the national series; districts calculated from the supplied EICV3, EICV4 and EICV5 poverty files (people below the poverty line). The EICV3 file is a January 2014 re-estimate (46.0% nationally against 44.9% published), so changes from 2010/11 are indicative. Since 2016/17 see the Poverty Changes card.
      </p>
    </Card>
  );
}
