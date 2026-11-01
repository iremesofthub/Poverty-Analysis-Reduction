import React, { useMemo } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import Card from "@/components/analyst/Card";
import { DASHBOARD_SOURCES } from "@/data/dashboardEvidence";
import { mapFinancialAccessRows, selectCompleteNationalAccessStrand } from "@/data/financialInclusion";
import { useActiveEvidence } from "@/lib/useFinancialInclusionData";

export default function AccessCard({ province }) {
  const evidence = useActiveEvidence();
  const { selected, source } = useMemo(() => {
    const next = selectCompleteNationalAccessStrand(evidence.observations);
    return { selected: next, source: evidence.sources.find((item) => item.source_id === next?.sourceId) || null };
  }, [evidence.observations, evidence.sources]);
  const observations = selected?.rows || [];
  const loadState = evidence.isLoading ? "loading" : evidence.isError ? "error" : "ready";

  const chartRows = useMemo(() => mapFinancialAccessRows(observations), [observations]);
  const included = observations.find((row) => row.indicator === "overall_inclusion_access_strand" && row.geography_level === "national" && !row.segment);
  const sourceTitle = source?.title || "Rwanda FinScope Survey 2024";
  const periodYear = String(source?.period_label || "").match(/\d{4}/)?.[0];
  const sourcePeriod = periodYear && !sourceTitle.includes(periodYear) ? ` · ${source.period_label}` : "";
  const populationLabel = chartRows[0]?.population || "Adults aged 16+";
  const isComplete = chartRows.length === 4 && chartRows.reduce((sum, row) => sum + row.value, 0) === 100;
  const aiContext = isComplete && included
    ? `Verified records from the Supabase financial inclusion tables. ${sourceTitle}${source?.period_label ? ` (${source.period_label})` : ""}, ${populationLabel}. Mutually exclusive Access Strand: ${chartRows.map((row) => `${row.label} ${row.value}%`).join("; ")}. Financially included (formal or informal): ${included.value}%. Denominator: ${included.denominator}. Source: ${source?.source_url}; ${chartRows[0].tableReference}. These are national survey estimates; they do not change with province selection. No confidence interval is available in this published table.`
    : null;

  return (
    <Card
      title="Financial Inclusion"
      subtitle="How adults use financial services in Rwanda"
      info="FinScope is a household survey: it asks adults about services they use, including informal services. The four Access Strand groups are mutually exclusive, so each adult is counted once. These national figures stay the same when you filter by province. NBR's provider dashboard is a different, supply-side measure."
      aiInsight={included ? `${sourceTitle} reports ${included.value}% of adults included through formal or informal financial services.` : null}
      aiContext={aiContext}
      inlineHelp
    >
      {loadState === "loading" && <p className="rounded-lg border border-hairline bg-canvas px-3 py-3 text-[12px] text-sub" role="status">Loading verified financial inclusion figures from the data store…</p>}
      {loadState === "error" && <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-3 text-[12px] text-[#93570A]" role="status">Financial inclusion figures are unavailable because the data store could not be reached. The chart will appear when the connection is restored.</p>}
      {loadState === "ready" && !isComplete && <p className="rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-3 text-[12px] text-[#93570A]" role="status">The imported source does not contain a complete national Access Strand. No chart is shown.</p>}

      {loadState === "ready" && isComplete && (
        <>
          <div className="rounded-lg border border-hairline bg-canvas px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A94A6]">{sourceTitle}{sourcePeriod}</p>
                <p className="mt-1 text-[20px] font-semibold leading-none text-ink tabular-nums">{included?.value ?? "—"}% <span className="text-[11px] font-normal text-sub">financially included</span></p>
              </div>
              <span className="text-[11px] text-sub">{populationLabel}</span>
            </div>
          </div>
          {province !== "all" && <p className="mt-2 rounded-md border border-[#FEDF89] bg-[#FFFAEB] px-2.5 py-1.5 text-[11px] text-[#93570A]">National estimate only; selecting {province} does not change this chart.</p>}
          <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
            <div role="img" aria-label={`${sourceTitle} national Access Strand pie chart for ${populationLabel}. ${chartRows.map((row) => `${row.label} ${row.value} percent`).join(", ")}.`} className="shrink-0">
              <PieChart width={184} height={184}>
                <Pie data={chartRows} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={84} startAngle={90} endAngle={-270} stroke="#FFFFFF" strokeWidth={2} isAnimationActive={false} labelLine={false} label={({ cx, cy, midAngle, value }) => {
                  if (value < 10) return null;
                  const angle = -midAngle * Math.PI / 180;
                  return <text x={cx + 55 * Math.cos(angle)} y={cy + 55 * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fill="#FFFFFF" fontSize={12} fontWeight={600}>{value}%</text>;
                }}>
                  {chartRows.map((row) => <Cell key={row.key} fill={row.color} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value}% of adults`, name]} contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11, color: "#0A2540", boxShadow: "0 8px 24px rgba(10,37,64,0.12)" }} />
              </PieChart>
            </div>
            <ul className="grid w-full min-w-0 grid-cols-1 gap-y-3">
              {chartRows.map((row) => <li key={row.key} className="flex items-center gap-2 text-[11.5px]"><span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/5" style={{ backgroundColor: row.color }} /><span className="text-sub">{row.label}</span><strong className="ml-auto tabular-nums text-ink">{row.value}%</strong></li>)}
            </ul>
          </div>
          <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
            <a href={source?.source_url || DASHBOARD_SOURCES.financial} target="_blank" rel="noreferrer" className="underline underline-offset-2">Source: {sourceTitle}</a>
            {chartRows[0].tableReference ? ` · ${chartRows[0].tableReference}` : ""} · National survey estimates for adults 16+. Percentages are rounded. No confidence interval is published with this table.
          </p>
        </>
      )}
    </Card>
  );
}
