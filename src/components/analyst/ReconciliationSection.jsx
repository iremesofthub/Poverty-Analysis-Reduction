// UPG-05: the reconciliation read-out shared by Programme Results and the District Investigation.
//
// This component renders nothing that the contract in `src/lib/participationReconciliation.js` has not
// already decided. It exists because a reader comparing "11.6% of households report VUP support" with a
// programme count will otherwise do the subtraction themselves, and that subtraction mixes a survey share
// with a register count. The panel states each comparison, the verdict, the reason, and what is missing.
//
// Design rules enforced here:
//   - No administrative total is typed into this file. There is no authorised register in this build, so the
//     register side reads "not available" and names who could supply it.
//   - No gap, no adjusted gap and no "expected registrations" figure is calculated.
//   - Nothing is filed automatically. The link goes to the request queue for a person to decide.
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Download } from "lucide-react";
import Card from "@/components/analyst/Card";
import { DASHBOARD_DISTRICTS, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { RELIABILITY_LABELS } from "@/lib/districtUncertainty";
import { ROUTE_ACCESS } from "@/lib/judgeFeatureRegistry";
import { useRole } from "@/lib/DemoAuthContext";
import {
  DATA_LINEAGE,
  VERDICT,
  administrativeSide,
  buildReconciliation,
  reconciliationToCsv,
  sensitivityBand,
} from "@/lib/participationReconciliation";

const PERIOD = "2023/24";
const SURVEY_SOURCE = "NISR EICV7 2023/24 published tables";

const TONE = {
  ok: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
  warn: "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
  bad: "border-[#FECDCA] bg-[#FEF3F2] text-[#B42318]",
  neutral: "border-hairline bg-[#F7F9FC] text-[#425466]",
};

const VERDICT_TONE = {
  [VERDICT.COMPARABLE]: "ok",
  [VERDICT.NOT_COMPARABLE]: "warn",
  [VERDICT.OUT_OF_PERIOD]: "warn",
  [VERDICT.UNAPPROVED]: "warn",
  [VERDICT.NOT_PERMITTED]: "bad",
  [VERDICT.UNRESOLVED]: "neutral",
  [VERDICT.NOT_ESTIMATED]: "neutral",
};

const percent = (value) => `${Number(value).toFixed(1)}%`;
const number = new Intl.NumberFormat("en-US");
const isFigure = (value) => typeof value === "number" && Number.isFinite(value);

// Says what the survey side is, in one line, including the uncertainty the design supports and an explicit
// statement where the build holds no variance record for the measure.
function surveyLine(survey) {
  if (!survey || !isFigure(survey.estimate)) {
    return "No survey estimate exists for this measure in this build.";
  }
  const parts = [`${percent(survey.estimate)} ${survey.unit}`];
  parts.push(survey.interval ? `95% interval ${percent(survey.interval.low)} to ${percent(survey.interval.high)}` : "interval not calculated for this measure");
  if (isFigure(survey.standardError)) parts.push(`standard error ${survey.standardError}`);
  if (isFigure(survey.sample?.observations)) {
    parts.push(`${survey.sample.observations} surveyed${isFigure(survey.sample.psus) ? ` in ${survey.sample.psus} PSUs` : ""}`);
  }
  const reliability = RELIABILITY_LABELS[survey.reliability];
  if (reliability) parts.push(`reliability: ${reliability.label.toLowerCase()}`);
  return parts.join(" · ");
}

function adminLine(admin) {
  if (!admin) return "No administrative side was supplied.";
  if (admin.state === "not_available") return "Not available in this build: no authorised VUP register extract exists here.";
  if (admin.state === "not_permitted") return "Exists, but this account is not permitted to read it.";
  if (admin.state === "incomplete") return `Supplied but incomplete: ${admin.missingFields.join(", ")} missing.`;
  return `${number.format(admin.count)} ${admin.unit} · ${admin.status} · period ${admin.period} · table ${admin.sourceTable} · updated ${admin.lastUpdated}`;
}

export default function ReconciliationSection({
  place = null,
  membershipValues = {},
  className = "",
  fileStem = "survey-admin-reconciliation",
  title = "Survey Figures and Programme Records",
  subtitle = "Why a participation estimate and a beneficiary count are not the same measurement",
}) {
  const role = useRole();
  const [showMethod, setShowMethod] = useState(false);
  const district = useMemo(() => {
    const key = String(place ?? "").trim().toLowerCase();
    if (!key) return null;
    return DASHBOARD_DISTRICTS.find((row) => row.name.toLowerCase() === key) ?? null;
  }, [place]);

  const membershipKey = JSON.stringify(membershipValues);
  const reconciliation = useMemo(
    () => buildReconciliation({
      national: NATIONAL_EICV7,
      district,
      period: PERIOD,
      source: SURVEY_SOURCE,
      adminReference: null,
      membershipValues: JSON.parse(membershipKey),
      // Coverage is counted over the same rows the dashboard renders, so the panel cannot claim more
      // measurable geographies than the application actually has intervals for.
      districtRows: DASHBOARD_DISTRICTS,
    }),
    [district, membershipKey],
  );

  // The refusal is part of the result: with no register and no signed mapping there is nothing to base a
  // sensitivity range on, so the panel shows why it declines instead of leaving the reader to imagine one.
  const band = useMemo(() => sensitivityBand({ low: null, high: null }), []);
  const absentReference = useMemo(() => administrativeSide(null), []);
  // Asked for an empty reference, the contract answers with the fields it would need. That list is the
  // panel's request to the data owner, so the wording is never maintained in two places.
  const requiredFields = useMemo(() => administrativeSide({}).missingFields, []);
  const mayOpenRequests = (ROUTE_ACCESS["/programmes"] ?? []).includes(role);
  const placeLabel = district ? district.name : "Rwanda";

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(["\uFEFF", reconciliationToCsv(reconciliation)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileStem}-${district ? district.name.toLowerCase().replace(/\s+/g, "-") : "rwanda"}-${PERIOD.replace("/", "-")}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const aiContext = `UPG-05 reconciliation for ${placeLabel}, EICV7 2023/24. Rows: ${reconciliation.rows.map((item) => `${item.title} = ${item.verdict} (${item.reasons.join(", ")})`).join(" | ")}. No authorised administrative register exists in this build, so no gap between survey participation and registered beneficiaries is calculated, and a gap would not be evidence of fraud or exclusion anyway.`;

  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={className}
      inlineHelp
      info="A survey estimate and a programme count answer different questions. The survey asks what share of households report VUP support; a register counts enrolled records. This panel pairs them only where the definitions allow it, and where they cannot be paired it says why instead of subtracting them."
      aiInsight="Treat an unresolved row as a missing input, not a finding. The difference between an estimated participation rate and a beneficiary count is first a question of population, period, programme subset, duplicates, survey error and the administrative frame."
      aiContext={aiContext}
      action={(
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-sub hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Export this reconciliation as CSV"
          data-testid="reconciliation-csv"
        >
          <Download className="h-3 w-3" aria-hidden="true" />CSV
        </button>
      )}
    >
      <div data-judge="reconciliation" data-testid="reconciliation-panel">
        <p className="text-[11.5px] leading-snug text-sub">
          Three comparisons for <strong className="font-medium text-ink">{placeLabel}</strong>, {PERIOD}. Each one states what it is, whether the two sides can be paired, and what stops it if they cannot.
        </p>

        <ul className="mt-3 space-y-3">
          {reconciliation.rows.map((row) => (
            <li key={row.title} data-testid="reconciliation-row" className="rounded-lg border border-hairline bg-[#FAFBFD] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="max-w-[46ch] text-[12px] font-semibold leading-snug text-ink">{row.title}</h3>
                <span className={`inline-flex shrink-0 rounded-full border px-2 py-[2px] text-[10.5px] font-medium ${TONE[VERDICT_TONE[row.verdict] || "neutral"]}`}>
                  {row.verdictLabel}
                </span>
              </div>

              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-2">
                <div>
                  <dt className="text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]">Survey estimate</dt>
                  <dd className="mt-0.5 leading-snug text-ink">{row.survey ? surveyLine(row.survey) : "Not applicable to this row."}</dd>
                </div>
                <div>
                  <dt className="text-[10.5px] uppercase tracking-[0.06em] text-[#8A94A6]">Administrative register</dt>
                  <dd className="mt-0.5 leading-snug text-ink">{adminLine(row.administrative)}</dd>
                </div>
              </dl>

              {row.difference ? (
                <p className="mt-2 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-2.5 py-2 text-[11.5px] leading-snug text-[#067647]">
                  Gap {row.difference.gap} {row.difference.unit}. {row.difference.note}
                </p>
              ) : (
                <p className="mt-2 text-[11px] leading-snug text-sub">
                  No difference is calculated: {row.verdict === VERDICT.UNRESOLVED ? "the second number was never read" : "the definitions do not allow one"}.
                </p>
              )}

              {row.statements?.length ? (
                <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
                  {row.statements.map((statement) => (
                    <li key={statement} className="flex gap-2 text-[11.5px] leading-snug text-sub">
                      <span aria-hidden="true" className="text-[#8A94A6]">-</span>
                      <span>{statement}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {row.memberships && row.memberships.components.some((item) => item.value !== null) ? (
                <p className="mt-2 text-[11.5px] leading-snug text-ink">
                  The component shares on this page add to <strong className="font-semibold tabular-nums">{row.memberships.total.toFixed(1)}</strong> points.{" "}
                  {row.memberships.note}
                </p>
              ) : null}

              <p className="mt-2 text-[11px] leading-snug text-[#425466]">{row.interpretationLimit}</p>
            </li>
          ))}
        </ul>

        <div className="mt-3 rounded-lg border border-dashed border-hairline p-3">
          <h3 className="text-[12px] font-semibold text-ink">What would make these rows comparable</h3>
          <p className="mt-1 text-[11.5px] leading-snug text-sub">{absentReference.reason}</p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink">
            A register comparison needs, for one period: {requiredFields.join(", ")}. It also needs the survey-to-register mapping signed by a named reviewer, which is the same rule the governed engine applies before an official figure and a computed figure are called equivalent.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-sub" data-testid="reconciliation-coverage">Available coverage: {reconciliation.coverage.statement}</p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-sub">Who can supply it: {absentReference.requiredActor}</p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-sub">{band.reason}</p>
          <p className="mt-2 text-[11.5px] leading-snug text-ink">
            {mayOpenRequests ? (
              <>
                Nothing is filed from this panel.{" "}
                <Link to="/programmes?tab=requests" className="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand">
                  Open the request queue
                </Link>{" "}
                to raise a row after reading the evidence behind it.
              </>
            ) : (
              "Nothing is filed from this panel. A programme account raises a request in the request queue after reading the evidence behind a row."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowMethod((open) => !open)}
          aria-expanded={showMethod}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-sub hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMethod ? "rotate-180" : ""}`} aria-hidden="true" />
          {showMethod ? "Hide" : "Show"} how these figures were produced
        </button>
        {showMethod ? (
          <div className="mt-2 rounded-lg border border-hairline bg-white p-3">
            <p className="text-[11px] leading-snug text-sub">
              Contract <code className="text-ink">{reconciliation.contract}</code>. Every figure above is read from the artifacts listed here; this panel calculates no statistic and holds no administrative total.
            </p>
            <ul className="mt-2 space-y-1.5">
              {DATA_LINEAGE.map((entry) => (
                <li key={entry.artifact} className="text-[11px] leading-snug text-sub">
                  <span className="font-medium text-ink">{entry.role}</span> — <code>{entry.artifact}</code>
                  {entry.supplies ? `: ${entry.supplies}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-sub">
              The design-based intervals are pending independent scientific review, so they are not a certified statement of accuracy.
            </p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
