import React, { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Target } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card from "@/components/analyst/Card";
import PanelGuide from "@/components/analyst/PanelGuide";
import { DASHBOARD_DISTRICTS, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { mapFinancialAccessRows, selectCompleteNationalAccessStrand } from "@/data/financialInclusion";
import { useActiveEvidence } from "@/lib/useFinancialInclusionData";
import { useTranslation } from "react-i18next";

const inTheGap = (row) => row.poverty >= 40 && row.vupAmongPoor < 15;

export default function Nst2Indicators() {
  const { t } = useTranslation();
  const evidence = useActiveEvidence();
  const access = useMemo(() => {
    const selected = selectCompleteNationalAccessStrand(evidence.observations);
    const parts = mapFinancialAccessRows(selected?.rows || []);
    if (parts.length !== 4) return null;
    const byLabel = Object.fromEntries(parts.map((part) => [part.label.toLowerCase().replace(/\s*\(.*\)/, ""), part.value]));
    return {
      banked: byLabel.banked,
      otherFormal: byLabel["other formal"],
      informalOnly: byLabel["informal only"],
      excluded: byLabel.excluded,
      year: String(parts[0]?.periodEnd || "").match(/\d{4}/)?.[0] || "2024",
    };
  }, [evidence.observations]);
  const formallyIncluded = access ? access.banked + access.otherFormal : null;
  const fmt = (value) => (value === null || value === undefined ? "—" : `${value}%`);
  const financialYear = useMemo(() => String(access?.year || "").match(/\d{4}/)?.[0] || "2024", [access]);
  const critical = useMemo(() => DASHBOARD_DISTRICTS.filter(inTheGap).length, []);

  const pillars = [
    {
      name: t("nst2.social"), note: t("nst2.socialNote"),
      rows: [
        { label: t("nst2.poverty"), value: `${NATIONAL_EICV7.poverty.toFixed(1)}%`, year: "2023/24" },
        { label: t("nst2.extreme"), value: `${NATIONAL_EICV7.extremePoverty.toFixed(1)}%`, year: "2023/24" },
        { label: t("nst2.vupPoor"), value: `${NATIONAL_EICV7.vupAmongPoor.toFixed(1)}%`, year: "2023/24" },
        { label: t("nst2.vupAll"), value: `${NATIONAL_EICV7.vupAmongAllHouseholds.toFixed(1)}%`, year: "2023/24" },
      ],
    },
    {
      name: t("nst2.economic"), note: t("nst2.economicNote"),
      rows: [
        { label: t("nst2.formal"), value: fmt(formallyIncluded), year: financialYear },
        { label: t("nst2.excluded"), value: fmt(access?.excluded), year: financialYear },
        { label: t("nst2.banked"), value: fmt(access?.banked), year: financialYear },
        { label: t("nst2.informal"), value: fmt(access?.informalOnly), year: financialYear },
      ],
    },
    {
      name: t("nst2.governance"), note: t("nst2.governanceNote"),
      rows: [
        { label: t("nst2.districts"), value: "30 / 30", year: "2024" },
        { label: t("nst2.critical"), value: critical.toString(), year: "2023/24" },
        { label: t("nst2.programmes"), value: "4", year: "2024" },
        { label: t("nst2.traceability"), value: t("nst2.perHousehold"), year: "2024" },
      ],
    },
  ];

  // Each bar keeps the survey it came from. The five values do not share a universe or a fieldwork period, so the
  // chart may show them side by side but must never let a reader subtract one from another (UPG-09 citation rule:
  // every numeric claim carries its source, chart numbers included).
  const EICV7_SOURCE = "NISR EICV7 2023/24";
  const FINSCOPE_SOURCE = `NISR FinScope ${financialYear}`;
  const chart = [
    { name: "Poverty", value: NATIONAL_EICV7.poverty, source: EICV7_SOURCE },
    { name: "Extreme", value: NATIONAL_EICV7.extremePoverty, source: EICV7_SOURCE },
    ...(formallyIncluded === null ? [] : [{ name: "Formal", value: formallyIncluded, source: FINSCOPE_SOURCE }]),
    ...(access?.excluded === undefined || access.excluded === null ? [] : [{ name: "Excluded", value: access.excluded, source: FINSCOPE_SOURCE }]),
    { name: "VUP, poor", value: NATIONAL_EICV7.vupAmongPoor, source: EICV7_SOURCE },
  ];

  return (
    <div className="pb-14">
      <PageHeader
        title={t("nst2.title")}
        badge={
          <span className="hidden items-center gap-1.5 rounded-full border border-hairline px-2 py-[3px] text-[11px] text-sub sm:inline-flex">
            <Target className="h-3 w-3 text-brand" />
            2024–2029
          </span>
        }
      />

      <PanelGuide id="nst2-goals" title={t("nst2.title")}>
        Rwanda set national development targets for 2024–2029. This page shows whether current data
        meets those targets. "Target pending" means the official number hasn't been set yet.
      </PanelGuide>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4" data-tour="nst2-intro">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">{t("nst2.intro")}</h2>
          <p className="mt-0.5 text-[12px] text-sub">{t("nst2.question")}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            {pillars.map((p) => (
              <Card key={p.name} title={p.name} subtitle={p.note} info="This is one group of national goals. Each row is one number, with its target." bodyClassName="px-0 pb-0">
                <div className="border-t border-hairline">
                  {p.rows.map((r) => (
                    <div
                      key={r.label}
                      className="flex items-center gap-3 border-b border-hairline/70 px-5 py-2.5 last:border-0 hover:bg-[#FAFBFD]"
                    >
                      <span className="flex-1 text-[12px] text-ink">{r.label}</span>
                      <span className="text-[10.5px] tabular-nums text-[#8A94A6]">{r.year}</span>
                      <span className="w-16 text-right text-[12.5px] font-medium tabular-nums text-ink">{r.value}</span>
                      <span className="w-[92px] text-right">
                        <span className="inline-flex rounded-full border border-hairline bg-[#FAFBFD] px-2 py-[2px] text-[10px] font-medium text-[#8A94A6]">
                          {t("nst2.pending")}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <Card
              tour="nst2-latest" title={t("nst2.latest")}
              subtitle={t("nst2.latestHelp")}
              info="A quick snapshot of the most important numbers across all national goals. Each bar shows one key indicator as a percentage."
              aiInsight="This chart shows the latest values for five key national indicators. Compare them to see where Rwanda stands. Lower poverty and exclusion are better; higher formal access and coverage are better."
            >
              <div role="img" aria-label={`National indicator snapshot. ${chart.map((item) => `${item.name}: ${item.value.toFixed(1)} percent, from ${item.source}`).join(". ")}. These figures come from different surveys and populations, so they are not comparable by subtraction.`}>
                <ResponsiveContainer width="100%" height={196}>
                  <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="30%">
                  <CartesianGrid horizontal={false} stroke="#EDF1F7" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10, fill: "#8A94A6" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fontSize: 10.5, fill: "#425466" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#F7F9FC" }}
                    formatter={(v) => [`${Number(v).toFixed(1)}%`, ""]}
                    contentStyle={{ borderRadius: 8, border: "1px solid #E3E8EE", fontSize: 11 }}
                  />
                  <Bar dataKey="value" fill="#635BFF" radius={[0, 3, 3, 0]} barSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-sub">Sources: {[...new Set(chart.map((item) => item.source))].join(" · ")}. Different surveys, different populations — the bars are read separately, never subtracted from one another.</p>
            </Card>

            <Card
              tour="nst2-targets" title={t("nst2.targets")}
              subtitle={t("nst2.targetsHelp")}
              info="National targets, baselines and milestone years will appear here once the official NST2 indicator file is added. Current values already come from NISR survey data."
            >
              <p className="text-[11.5px] leading-relaxed text-sub">
                {t("nst2.targetsText")}
              </p>
            </Card>
          </div>
        </div>

        <p className="mt-5 text-[10.5px] text-[#8A94A6]">
          NST2 (2024–2029) · Vision 2050. Poverty and VUP figures are calculated from NISR EICV7 2023/24 (VUP is reported participation, not payments or eligibility); financial inclusion is the published national FinScope 2024 result.
        </p>
      </div>
    </div>
  );
}
