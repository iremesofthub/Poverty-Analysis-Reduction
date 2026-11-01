import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/analyst/Card";
import { Basis, Legend, Segmented, ViewTable } from "@/components/analyst/TrendBits";
import { DASHBOARD_SOURCES, FINANCIAL_ACCESS_NATIONAL } from "@/data/dashboardEvidence";
import { FINANCE_MEASURES } from "@/data/dashboardTrends";
import { selectTrendComparison } from "@/data/financialInclusion";
import { EvidenceError, EvidenceLoading, EvidenceMissing, useActiveEvidence } from "@/lib/useFinancialInclusionData";

const SEGMENTS = FINANCIAL_ACCESS_NATIONAL.map((part) => ({ key: part.key, label: part.label, color: part.color }));
const KEYS = { banked: "banked", otherFormal: "other_formal", informalOnly: "informal_only", excluded: "excluded" };
const TOWARD = "#635BFF";
const AWAY = "#F5A623";
const NEUTRAL = "#A3ADBD";
const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;

function colourFor(measure, change) {
  const better = FINANCE_MEASURES[measure].better;
  if (!better || change.label.startsWith("No clear")) return NEUTRAL;
  return (better === "rise") === change.points > 0 ? TOWARD : AWAY;
}

function Tip({ active = false, payload = [] }) {
  if (!active || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-[230px] rounded-lg border border-hairline bg-white px-3 py-2 shadow-[0_8px_24px_rgba(10,37,64,0.12)]">
      <p className="text-[12px] font-semibold text-ink">Rwanda, {row.name}</p>
      <ul className="mt-1 space-y-0.5">{SEGMENTS.map((segment) => <li key={segment.key} className="flex items-center gap-1.5 text-[11px] text-sub"><span className="h-2 w-2 rounded-sm border border-black/10" style={{ backgroundColor: segment.color }} />{segment.label}<strong className="ml-auto tabular-nums text-ink">{row[segment.key]}%</strong></li>)}</ul>
    </div>
  );
}

export default function FinanceChangeCard({ rows }) {
  const [measure, setMeasure] = useState("excluded");
  const [showAll, setShowAll] = useState(false);
  const evidence = useActiveEvidence();
  const comparison = useMemo(() => selectTrendComparison(evidence.observations), [evidence.observations]);
  const ready = Boolean(comparison && comparison.districts.length >= 30);
  const names = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const info = FINANCE_MEASURES[measure];
  const changeDistricts = useMemo(() => (comparison?.districts || []).filter((row) => names.has(row.name) && row[measure]), [comparison, names, measure]);
  const NATIONAL = useMemo(() => (comparison && ready ? [
    { name: "2020 (restated by NISR)", ...Object.fromEntries(Object.entries(KEYS).map(([key, source]) => [key, comparison.national.y2020Restated[source]])) },
    { name: "2024", ...Object.fromEntries(Object.entries(KEYS).map(([key, source]) => [key, comparison.national.y2024[source]])) },
  ] : []), [comparison, ready]);
  const sorted = useMemo(() => changeDistricts.filter((row) => row[measure].change).sort((a, b) => a[measure].change.points - b[measure].change.points), [changeDistricts, measure]);
  const visible = showAll ? sorted : sorted.slice(0, 8);
  const limit = Math.max(5, Math.ceil(Math.max(0, ...changeDistricts.flatMap((row) => (row[measure]?.change ? [Math.abs(row[measure].change.ci_lower), Math.abs(row[measure].change.ci_upper)] : []))) / 10) * 10);
  const place = (value) => `${50 + (Math.max(-limit, Math.min(limit, value)) / limit) * 50}%`;
  const counts = comparison?.counts || {};
  const here = counts[measure] || { "Clear rise": 0, "Clear fall": 0, Possible: 0, "No clear change": 0 };
  const mobile = comparison?.national?.mobileMoney || { 2020: "—", 2024: "—", published: {} };
  const nationalLine = comparison ? `2020 restated by NISR banked ${comparison.national.y2020Restated.banked}, other formal ${comparison.national.y2020Restated.other_formal}, informal only ${comparison.national.y2020Restated.informal_only}, excluded ${comparison.national.y2020Restated.excluded}; 2024 banked ${comparison.national.y2024.banked}, other formal ${comparison.national.y2024.other_formal}, informal only ${comparison.national.y2024.informal_only}, excluded ${comparison.national.y2024.excluded}` : "national trend rows unavailable";
  const samples = ready ? comparison.districts.map((row) => row.sampleAdults2020).filter((n) => Number.isFinite(n)) : [];
  const sampleText = samples.length ? `District samples are about ${Math.min(...samples)} to ${Math.max(...samples)} adults in 2020.` : "";

  return (
    <Card
      title="Financial Inclusion 2020 to 2024"
      subtitle="See which districts moved, and how sure the surveys are."
      info="Each dot is the change in a district between FinScope 2020 and FinScope 2024, in percentage points. The thin line is the 95% interval; if it crosses zero the surveys cannot tell a real change from chance. A change is called clear only after allowing for comparing 30 districts at once. 2020 comes from NISR's own strand in the microdata; 2024 uses NISR's published district figures, so the 2024 side is a rounded whole number with an approximate margin."
      aiInsight={ready ? `Across ${comparison.districts.length} districts, the share of adults using no financial service clearly fell in ${counts.excluded?.["Clear fall"] ?? 0} between 2020 and 2024; nationally NISR reports ${comparison.national.y2020Restated.excluded}% excluded in 2020 and ${comparison.national.y2024.excluded}% in 2024.` : null}
      aiContext={ready ? `NISR FinScope 2020 (microdata, NISR's own Financial Access Strand) and FinScope 2024 (published district figures, Figure 13). Rwanda, % of adults: ${nationalLine}. Registered mobile money users: about ${mobile["2020"]}% in 2020 and ${mobile["2024"]}% in 2024 (NISR published ${mobile.published?.["2020"] ?? "—"}% and ${mobile.published?.["2024"] ?? "—"}%). Measure shown: ${info.label}. ${sorted.map((row) => `${row.name}: ${row[measure].y2020.pct}% to ${row[measure].y2024}% (${signed(row[measure].change.points)} points, ${row[measure].change.ci_lower.toFixed(1)} to ${row[measure].change.ci_upper.toFixed(1)}), ${row[measure].change.label}`).join("; ")}. Banked is not compared because NISR changed its definition (${comparison.national.y2020Microdata?.banked ?? 36}% originally in 2020, restated to ${comparison.national.y2020Restated.banked}%). ${sampleText} Not linked to the poverty survey; changes are described, not explained. Source: ${DASHBOARD_SOURCES.financial}.` : null}
      inlineHelp
    >
      {(evidence.isLoading || evidence.isError || !ready) && (
        evidence.isLoading ? <EvidenceLoading label="district trend figures" /> : evidence.isError ? <EvidenceError /> : <EvidenceMissing label="The approved district trend dataset" />
      )}
      {ready && <>
      <Basis />
      <div className="mt-3"><Legend items={SEGMENTS} /></div>
      <div className="mt-2" role="img" aria-label={`Rwanda financial access strands. ${NATIONAL.map((row) => `${row.name}: ${SEGMENTS.map((segment) => `${segment.label} ${row[segment.key]} percent`).join(", ")}`).join(". ")}`}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={NATIONAL} margin={{ top: 16, right: 8, bottom: 2, left: 0 }} barCategoryGap="22%" barGap={3}>
            <CartesianGrid vertical={false} stroke="#EDF1F7" />
            <XAxis dataKey="name" interval={0} tick={{ fontSize: 10.5, fill: "#425466" }} axisLine={{ stroke: "#C9D1DC" }} tickLine={false} />
            <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} width={44} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: "#F7F9FC" }} />
            {SEGMENTS.map((segment) => (
              <Bar key={segment.key} dataKey={segment.key} name={segment.label} fill={segment.color} stroke={segment.key === "excluded" ? "#C9D1DC" : "none"} radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                <LabelList dataKey={segment.key} position="top" formatter={(value) => `${value}`} style={{ fontSize: 10, fontWeight: 600, fill: "#425466" }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10.5px] text-[#8A94A6]">Rwanda, % of adults. NISR originally reported 36% banked in 2020 and later restated it as 22% on the 2024 definition, so banked is not compared by district.</p>

      <div className="mt-1"><Segmented label="Measure shown by district" value={measure} onChange={(key) => { setMeasure(key); setShowAll(false); }} options={Object.entries(FINANCE_MEASURES).map(([key, value]) => ({ key, label: value.short }))} /></div>
      <p className="mt-3 text-[11px] text-sub"><strong className="text-ink">{info.label}:</strong> {here["Clear rise"]} clearly rose · {here["Clear fall"]} clearly fell · {here.Possible} possible · {here["No clear change"]} no clear change (of 30 districts). {info.note}</p>
      <div className="mt-2"><Legend items={info.better ? [{ label: "Toward more inclusion", color: TOWARD }, { label: "Away from inclusion", color: AWAY }, { label: "No clear change", color: NEUTRAL }, { label: "Hollow dot: possible, not robust to 30 comparisons", color: "#425466", hollow: true }] : [{ label: "Direction of change (not good or bad)", color: NEUTRAL }, { label: "Hollow dot: possible, not robust to 30 comparisons", color: "#425466", hollow: true }]} /></div>
      <ol className="mt-2 divide-y divide-hairline/70">
        {visible.map((row) => {
          const change = row[measure].change;
          const tone = colourFor(measure, change);
          const possible = change.label.startsWith("Possible");
          const from = Math.max(-limit, change.ci_lower);
          const to = Math.min(limit, change.ci_upper);
          return (
            <li key={row.name} className="grid grid-cols-[78px_minmax(80px,1fr)_104px] items-center gap-2 py-2 sm:grid-cols-[110px_minmax(100px,1fr)_160px] sm:gap-3"
              aria-label={`${row.name}: ${row[measure].y2020.pct} percent in 2020, ${row[measure].y2024} percent in 2024, ${signed(change.points)} percentage points, 95% interval ${change.ci_lower.toFixed(1)} to ${change.ci_upper.toFixed(1)}, ${change.label}`}>
              <span className="break-words text-[11px] font-medium leading-tight text-ink sm:text-[12px]">{row.name}</span>
              <div className="relative h-5" title={`${row[measure].y2020.pct}% to ${row[measure].y2024}% · ${signed(change.points)} points (${change.ci_lower.toFixed(1)} to ${change.ci_upper.toFixed(1)}) · ${change.label}`}>
                <div className="absolute left-1/2 top-0 h-5 w-px bg-[#C9D1DC]" />
                <div className="absolute top-[9px] h-[2px] rounded bg-[#C9D1DC]" style={{ left: place(from), width: `${((to - from) / limit) * 50}%` }} />
                <span className="absolute top-[4px] h-3 w-3 -translate-x-1/2 rounded-full border-2" style={{ left: place(change.points), backgroundColor: possible ? "#fff" : tone, borderColor: possible ? tone : "#fff", boxShadow: possible ? "none" : `0 0 0 1px ${tone}` }} />
              </div>
              <span className="text-right text-[10.5px] tabular-nums text-ink sm:text-[11.5px]">
                <span className="block font-medium">{row[measure].y2020.pct.toFixed(1)} → {row[measure].y2024.toFixed(1)}%</span>
                <span className="text-sub">{signed(change.points)} pt · {change.label.replace(" (not robust to testing 30 districts)", "")}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-between text-[10px] text-[#8A94A6]"><span>← fell</span><span>0</span><span>rose →</span></div>
      {sorted.length > 8 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-2 text-[11px] font-medium text-brand hover:underline">
          {showAll ? "Show the 8 largest falls" : `Show all ${sorted.length} districts`}
        </button>
      )}
      <ViewTable head={["District", "2020 %", "2024 %", "Change (points)", "95% interval", "Result"]}
        rows={sorted.map((row) => [row.name, row[measure].y2020.pct.toFixed(1), row[measure].y2024.toFixed(1), signed(row[measure].change.points), `${row[measure].change.ci_lower.toFixed(1)} to ${row[measure].change.ci_upper.toFixed(1)}`, row[measure].change.label])} />
      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        Sources: NISR FinScope 2020 microdata (NISR's own access strand; {comparison.national.y2020Microdata.formal}% formally served nationally, as published) and <a href={DASHBOARD_SOURCES.financial} target="_blank" rel="noreferrer" className="underline underline-offset-2">Rwanda FinScope 2024</a> district figures (whole numbers; their margin is approximated, so intervals are likely too narrow). Mobile money is estimated from the questionnaire in both years: {mobile[2020]}% and {mobile[2024]}% against NISR's published {mobile.published?.[2020]}% and {mobile.published?.[2024]}%.
      </p>
      </>}
    </Card>
  );
}
