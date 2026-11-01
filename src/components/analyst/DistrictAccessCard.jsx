import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "@/components/analyst/Card";
import { Basis, Legend, Segmented, ViewTable } from "@/components/analyst/TrendBits";
import { DASHBOARD_SOURCES, FINANCIAL_ACCESS_NATIONAL } from "@/data/dashboardEvidence";
import { mapFinancialAccessRows, selectCompleteNationalAccessStrand, selectDistrictAccess } from "@/data/financialInclusion";
import { EvidenceError, EvidenceLoading, EvidenceMissing, useActiveEvidence } from "@/lib/useFinancialInclusionData";

const SEGMENTS = FINANCIAL_ACCESS_NATIONAL.map((part) => ({ key: part.key, label: part.label, color: part.color }));
const SORTS = { excluded: "Most excluded", banked: "Least banked" };

function Tip({ active = false, payload = [] }) {
  if (!active || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="max-w-[230px] rounded-lg border border-hairline bg-white px-3 py-2 shadow-[0_8px_24px_rgba(10,37,64,0.12)]">
      <p className="text-[12px] font-semibold text-ink">{row.name}</p>
      <ul className="mt-1 space-y-0.5">{SEGMENTS.map((segment) => <li key={segment.key} className="flex items-center gap-1.5 text-[11px] text-sub"><span className="h-2 w-2 rounded-sm border border-black/10" style={{ backgroundColor: segment.color }} />{segment.label}<strong className="ml-auto tabular-nums text-ink">{row[segment.key]}%</strong></li>)}</ul>
      <p className="mt-1 text-[10px] text-sub">FinScope 2024 · {row.sampleAdults} adults surveyed</p>
    </div>
  );
}

export default function DistrictAccessCard({ rows }) {
  const [sort, setSort] = useState("excluded");
  const [showAll, setShowAll] = useState(false);
  const evidence = useActiveEvidence();
  const names = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const dbDistricts = useMemo(() => selectDistrictAccess(evidence.observations), [evidence.observations]);
  const national = useMemo(() => mapFinancialAccessRows(selectCompleteNationalAccessStrand(evidence.observations)?.rows || []), [evidence.observations]);
  const data = useMemo(() => (dbDistricts || []).filter((row) => names.has(row.name)).map((row) => ({ name: row.name, sampleAdults: row.sampleAdults, excludedPrinted: row.excludedPrinted, ...row.published }))
    .sort((a, b) => (sort === "excluded" ? b.excluded - a.excluded || a.banked - b.banked : a.banked - b.banked)), [dbDistricts, names, sort]);
  const visible = showAll ? data : data.slice(0, 10);
  const lead = data[0];
  const nationalText = national.length ? national.map((row) => `${row.label.toLowerCase()} ${row.value}%`).join(", ") : "not available";

  return (
    <Card
      title="Financial Inclusion by District"
      subtitle="See how adults in each district use financial services."
      info="Each bar is 100 adults in that district from FinScope 2024. Every adult is counted once, in the first group that applies: bank services, then other formal services, then informal services only, then none. Figures are NISR's published district results, rounded to whole numbers. District samples are about 400 to 850 adults, so small differences between districts are not meaningful."
      aiInsight={lead ? `${lead.name} has the largest share of adults using no financial service (${lead.excluded}%) among the districts shown. District samples are small.` : "No district is selected."}
      aiContext={`NISR FinScope Rwanda 2024, Figure 13 (published district Access Strand, percent of adults, whole numbers). Mutually exclusive groups: bank services, other formal not banked, informal only, excluded. Districts shown: ${data.map((row) => `${row.name}: banked ${row.banked}%, other formal ${row.otherFormal}%, informal only ${row.informalOnly}%, excluded ${row.excluded}%`).join("; ")}. National: ${nationalText}. Each district sample is about 400 to 850 adults. This is not linked to the poverty survey household by household. Source: ${DASHBOARD_SOURCES.financial}.`}
      inlineHelp
    >
      {(evidence.isLoading || evidence.isError || !dbDistricts) && (
        evidence.isLoading ? <EvidenceLoading label="district figures" /> : evidence.isError ? <EvidenceError /> : <EvidenceMissing label="The approved district dataset" />
      )}
      {!evidence.isLoading && !evidence.isError && dbDistricts && <>
      <Basis />
      <Segmented label="Order of districts" value={sort} onChange={setSort} options={Object.entries(SORTS).map(([key, label]) => ({ key, label }))} />
      <div className="mt-3"><Legend items={SEGMENTS} /></div>
      <div className="mt-2" role="img" aria-label={`Financial access by district. ${visible.map((row) => `${row.name}: banked ${row.banked} percent, other formal ${row.otherFormal}, informal only ${row.informalOnly}, excluded ${row.excluded}`).join(". ")}`}>
        <ResponsiveContainer width="100%" height={visible.length * 74 + 30}>
          <BarChart data={visible} layout="vertical" margin={{ top: 2, right: 24, bottom: 2, left: 0 }} barCategoryGap="14%" barGap={1}>
            <CartesianGrid horizontal={false} stroke="#EDF1F7" />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#8A94A6" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={83} interval={0} tick={{ fontSize: 10.5, fill: "#425466" }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} cursor={{ fill: "#F7F9FC" }} />
            {SEGMENTS.map((segment) => (
              <Bar key={segment.key} dataKey={segment.key} name={segment.label} fill={segment.color} stroke={segment.key === "excluded" ? "#C9D1DC" : "none"} radius={[0, 2, 2, 0]} barSize={11} isAnimationActive={false}>
                <LabelList dataKey={segment.key} position="right" formatter={(value) => `${value}`} style={{ fontSize: 9, fontWeight: 600, fill: "#425466" }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > 10 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-1 text-[11px] font-medium text-brand hover:underline">{showAll ? "Show the first 10" : `Show all ${data.length} districts`}</button>
      )}
      <ViewTable head={["District", "Banked %", "Other formal %", "Informal only %", "Excluded %", "Adults surveyed"]} rows={data.map((row) => [row.name, row.banked, row.otherFormal, row.informalOnly, row.excludedPrinted ? row.excluded : `${row.excluded} (not printed)`, row.sampleAdults])} />
      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        <a href={DASHBOARD_SOURCES.financial} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: Rwanda FinScope 2024, Figure 13</a> · adults aged 16+. Whole-number rounding means a row can total 99 to 101. Nyarugenge's excluded share is not printed in the report and is shown as the remainder.
      </p>
      </>}
    </Card>
  );
}
