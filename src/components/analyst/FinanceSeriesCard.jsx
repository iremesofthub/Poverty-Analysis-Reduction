import React, { useMemo, useState } from "react";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/analyst/Card";
import DataNote from "@/components/analyst/support/DataNote";
import { Basis, Legend, Segmented, ViewTable, tooltipStyle } from "@/components/analyst/TrendBits";
import { DASHBOARD_SOURCES } from "@/data/dashboardEvidence";
import { selectNationalSeries, selectProvinceSeries } from "@/data/financialInclusion";
import { EvidenceError, EvidenceLoading, EvidenceMissing, useActiveEvidence } from "@/lib/useFinancialInclusionData";

const LINES = [
  { key: "formal", label: "Formally served", color: "#14B8A6", place: "top" },
  { key: "informal_only", label: "Informal only", color: "#F5A623", place: "top" },
  { key: "excluded", label: "Excluded", color: "#425466", place: "bottom" },
];
const MEASURES = [
  { key: "excluded", label: "Excluded" },
  { key: "formal", label: "Formally served" },
  { key: "informal_only", label: "Informal only" },
  { key: "banked", label: "Banked" },
];
const comparable = ["2016", "2020", "2024"];
function Finscope2012Note() {
  return (
    <>
      <p>FinScope 2012 is in the supplied data but is not plotted. Its file has no NISR access-strand variable, so we rebuilt the groups from the questionnaire.</p>
      <p className="mt-1.5">The rebuild did not reproduce NISR's published 2012 results (23% banked, 42% formally served, 28% excluded): our banked share stayed about 3.5 points low, outside our 1-point tolerance.</p>
      <p className="mt-1.5">We asked NISR for the 2012 definition, and it could not be confirmed before submission. We show 2016, 2020 and 2024 only, rather than force a match.</p>
    </>
  );
}
const signed = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const sourceOf = (year) => (year === "2024" ? "NISR published" : "NISR microdata");
const tone = (label = "") => (label.startsWith("Clear") ? "bg-emerald-50 text-emerald-700" : label.startsWith("Possible") ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600");

export default function FinanceSeriesCard({ rows }) {
  const [measure, setMeasure] = useState("excluded");
  const evidence = useActiveEvidence();
  const series = useMemo(() => selectNationalSeries(evidence.observations), [evidence.observations]);
  const dbProvinces = useMemo(() => selectProvinceSeries(evidence.observations), [evidence.observations]);
  const provinces = useMemo(() => new Set(rows.map((row) => row.province)), [rows]);
  const DATA = useMemo(() => (series ? comparable.map((year) => {
    const item = series.series.find((entry) => entry.key === year);
    return { year, formal: item.formal, informal_only: item.informal_only, excluded: item.excluded };
  }) : []), [series]);
  const visible = useMemo(() => (dbProvinces || []).filter((item) => provinces.has(item.province)), [dbProvinces, provinces]);
  const ready = DATA.length === comparable.length && dbProvinces;
  const first = DATA[0] || { formal: "—", excluded: "—" };
  const last = DATA[DATA.length - 1] || first;
  const label = MEASURES.find((item) => item.key === measure).label;

  return (
    <Card
      title="Financial Inclusion Since 2016"
      subtitle="How the share of adults without access has changed over three surveys."
      info="Each point is the share of Rwandan adults in that survey year. Formally served adults use a bank or another regulated provider such as mobile money or a SACCO. Informal only means savings groups or informal lenders without any formal product. Excluded means neither. 2016 and 2020 come from NISR's own strand in the survey data; 2024 is NISR's published figure. Banked is left out of the lines because NISR changed its definition in 2024."
      aiInsight={ready ? `Formal use rose from ${first.formal}% in 2016 to ${last.formal}% in 2024, while the excluded share fell from ${first.excluded}% to ${last.excluded}%.` : null}
      aiContext={`NISR FinScope Rwanda 2016 and 2020 (microdata, NISR's own Financial Access Strand) and 2024 (published). Rwanda, % of adults. ${DATA.map((item) => `${item.year}: formally served ${item.formal}, informal only ${item.informal_only}, excluded ${item.excluded}`).join("; ")}. Banked: 26% in 2016 and 36% in 2020 on the original definition, restated by NISR to 22% for both 2020 and 2024. Province change 2016 to 2020 for ${label}: ${visible.map((item) => `${item.province} ${item[measure].y2016}% to ${item[measure].y2020}% (${item[measure].change ? `${signed(item[measure].change.points)} points, ${item[measure].change.label}` : "n/a"})`).join("; ")}. 2016 has no district data. Separate surveys; no causes can be inferred. Source: ${DASHBOARD_SOURCES.financial}.`}
      inlineHelp
    >
      {(evidence.isLoading || evidence.isError || !ready) && (
        evidence.isLoading ? <EvidenceLoading label="trend figures" /> : evidence.isError ? <EvidenceError /> : <EvidenceMissing label="The approved trend dataset" />
      )}
      {ready && <>
      <Basis />
      <div className="mt-3"><Legend items={LINES} /></div>
      <div className="mt-2" role="img" aria-label={`Rwanda adults by survey year. ${DATA.map((item) => `${item.year}: formally served ${item.formal} percent, informal only ${item.informal_only}, excluded ${item.excluded}`).join(". ")}`}>
        <ResponsiveContainer width="100%" height={210}>
          <LineChart data={DATA} margin={{ top: 14, right: 22, bottom: 10, left: -14 }}>
            <CartesianGrid vertical={false} stroke="#EDF1F7" />
            <XAxis dataKey="year" tick={{ fontSize: 10.5, fill: "#425466" }} axisLine={false} tickLine={false} />
            <YAxis domain={[-8, 100]} allowDataOverflow ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value, name) => [`${value}%`, name]} labelFormatter={(year) => `${year} · ${sourceOf(year)}`} contentStyle={tooltipStyle} />
            {LINES.map((line) => (
              <Line key={line.key} type="linear" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={2} dot={{ r: 4, fill: line.color, stroke: "#FFFFFF", strokeWidth: 2 }} isAnimationActive={false}>
                <LabelList dataKey={line.key} position={line.place} formatter={(value) => `${value}`} style={{ fontSize: 10, fontWeight: 600, fill: "#0A2540" }} />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10.5px] text-[#8A94A6]">Rwanda, % of adults. 2016 and 2020: NISR microdata; 2024: NISR published. The three groups add up to 100 in each year. <DataNote label="Why 2012 is not shown"><Finscope2012Note /></DataNote> In 2024 informal only and excluded are both 4%, so their points overlap.</p>
      <ViewTable head={["Year", "Source", "Formally served %", "Informal only %", "Excluded %"]} rows={DATA.map((item) => [item.year, sourceOf(item.year), item.formal, item.informal_only, item.excluded])} />

      <div className="mt-5 border-t border-hairline pt-3">
        <h3 className="text-[12px] font-semibold text-ink">By province, 2016 to 2020</h3>
        <p className="mt-0.5 text-[11px] text-sub">Both years use NISR's own strand under the same definition, so banked can be compared here.</p>
        <Segmented label="Measure shown by province" value={measure} onChange={setMeasure} options={MEASURES} />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[440px] text-left text-[11px]">
            <thead className="bg-[#F7F9FC] text-sub"><tr>{["Province", "2016", "2020", "Change", "Result"].map((head) => <th key={head} className="p-2 font-medium">{head}</th>)}</tr></thead>
            <tbody>
              {visible.map((item) => {
                const cell = item[measure];
                return (
                  <tr key={item.province} className="border-t border-hairline">
                    <td className="p-2 text-ink">{item.province}</td>
                    <td className="p-2 tabular-nums">{cell.y2016.toFixed(1)}%</td>
                    <td className="p-2 tabular-nums">{cell.y2020.toFixed(1)}%</td>
                    <td className="p-2 font-medium tabular-nums text-ink">{cell.change ? `${signed(cell.change.points)} pt` : "n/a"}<span className="block text-[10px] font-normal text-sub">{cell.change ? `${cell.change.ci_lower.toFixed(1)} to ${cell.change.ci_upper.toFixed(1)}` : ""}</span></td>
                    <td className="p-2">{cell.change && <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${tone(cell.change.label)}`}>{cell.change.label.replace(/ \(not robust to testing 5 provinces\)/, "")}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10.5px] text-[#8A94A6]">{label}, % of adults, with 95% intervals. "Clear" means significant after allowing for comparing 5 provinces. 2016 has no district data, so this is provincial.</p>
      </div>
      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        Sources: NISR FinScope 2016 and 2020 microdata (2016 checked against NISR's reported 26% banked, 42% other formal and 11% excluded) and <a href={DASHBOARD_SOURCES.financial} target="_blank" rel="noreferrer" className="underline underline-offset-2">Rwanda FinScope 2024</a>. 2016 intervals use weights only (no cluster field in the file) and are likely too narrow. FinScope 2012 is not included yet.
      </p>
      </>}
    </Card>
  );
}
