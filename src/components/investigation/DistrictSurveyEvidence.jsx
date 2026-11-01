import React, { useMemo, useState } from "react";
import FeatureMiniEntry from "@/components/discovery/FeatureMiniEntry";
import ReconciliationSection from "@/components/analyst/ReconciliationSection";
import { useRole } from "@/lib/DemoAuthContext";
import { DASHBOARD_DISTRICTS, EICV7_UNCERTAINTY, NATIONAL_EICV7 } from "@/data/dashboardEvidence";
import { contrastVerdict, reliabilityOf } from "@/lib/districtUncertainty";
import { formatInterval, hasInterval, isSmallSample } from "@/lib/povertySupport";

const byName = new Map(DASHBOARD_DISTRICTS.map((row) => [row.name, row]));
// The district in this workspace arrives from a URL parameter or a free-text
// field, so the lookup ignores case and surrounding space. It never guesses a
// district: an unrecognised name falls back to the national reference row.
const normalised = (value) => String(value ?? "").trim().toLowerCase();
const findDistrict = (value) => {
  const key = normalised(value);
  if (!key || key === "rwanda") return null;
  return byName.get(value) ?? DASHBOARD_DISTRICTS.find((row) => normalised(row.name) === key) ?? null;
};
// A name that matches neither a district nor "Rwanda" is reported as unknown
// rather than quietly rendered as the national row. While the field is still
// being typed, a value that could still become a real district is not called
// unknown, so the panel never flashes "not found" mid-entry.
const isUnknownPlace = (value) => {
  const key = normalised(value);
  if (!key || key === "rwanda" || findDistrict(value)) return false;
  return !DASHBOARD_DISTRICTS.some((row) => normalised(row.name).startsWith(key));
};

// UPG-01 in the District Investigation: the same design-based uncertainty the
// Statistics Dashboard shows, attached to the district under investigation, so a
// run is never interpreted off a point estimate alone. Nothing is calculated
// here; every field is read from the artifact produced by
// `tools/analysis/derive_dashboard_uncertainty.py`.
export default function DistrictSurveyEvidence({ district, className = "" }) {
  const role = useRole();
  const match = findDistrict(district);
  const name = match?.name ?? null;
  const unknown = isUnknownPlace(district);
  const [showMethod, setShowMethod] = useState(false);
  const row = match ?? NATIONAL_EICV7;
  const label = name ?? (unknown ? String(district).trim() : "Rwanda");
  const poverty = row.povertyEvidence;
  const vup = row.vupEvidence ?? null;
  const verdict = contrastVerdict(name ? row.povertyContrast : null);
  const reliability = reliabilityOf(poverty);
  const provenance = EICV7_UNCERTAINTY.provenance;
  const method = EICV7_UNCERTAINTY.method;

  const lines = useMemo(() => [
    { measure: "Poverty (share of people)", point: row.poverty, interval: row.povertyInterval, evidence: poverty },
    ...(vup ? [{ measure: "Reported VUP participation (surveyed poor households)", point: row.vupAmongPoor, interval: row.vupInterval, evidence: vup }] : []),
  ], [row, poverty, vup]);

  // An unrecognised place gets an honest empty state, never the national figures
  // under a different name.
  if (unknown) {
    return (
      <section id="district-survey-evidence" data-judge="survey-evidence" className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:p-6 ${className}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Survey evidence</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">No survey evidence found for “{label}”</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
          This workspace holds design-based estimates for Rwanda and its 30 EICV7 districts. Nothing is shown here because no matching district exists in the
          published aggregate — not because the uncertainty is zero. Choose one of the 30 districts or enter “Rwanda”.
        </p>
      </section>
    );
  }

  return (
    <section id="district-survey-evidence" data-judge="survey-evidence" className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.035)] sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Survey evidence</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">How much sampling uncertainty is behind {label}?</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Poverty counts people and reported VUP participation counts surveyed poor households. They are two different denominators and are never subtracted from each other in this workspace.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${EICV7_UNCERTAINTY.status.certified ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {EICV7_UNCERTAINTY.status.certified ? "Certified" : "Pending scientific review"}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <caption className="sr-only">Design-based estimates, 95% intervals and reliability for {label}</caption>
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Measure", "Estimate", "95% interval", "Standard error", "Reliability"].map((heading) => <th key={heading} scope="col" className="p-2 font-medium">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.measure} className="border-t border-slate-100">
                <th scope="row" className="p-2 text-left font-medium text-slate-900">{line.measure}</th>
                <td className="p-2 tabular-nums text-slate-900">{Number.isFinite(line.point) ? `${line.point.toFixed(1)}%` : "Not available"}</td>
                <td className="p-2 tabular-nums text-slate-600">{formatInterval(line.interval)}</td>
                <td className="p-2 tabular-nums text-slate-600">{Number.isFinite(line.evidence?.se) ? `${line.evidence.se.toFixed(2)} points` : "Not available"}</td>
                <td className="p-2">{reliabilityOf(line.evidence)?.label ?? "Not assessed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Difference from Rwanda</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{name ? verdict.label : "This is the national reference"}</p>
          {name && <p className="mt-1 text-xs leading-5 text-slate-600">{verdict.detail}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Sample behind these figures</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
            {poverty ? `${poverty.sampleObservations.toLocaleString()} person records · ${poverty.samplePsus} clusters` : "Not available"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Design degrees of freedom {poverty?.df ?? "not available"} · design effect {Number.isFinite(poverty?.designEffect) ? poverty.designEffect.toFixed(2) : "not available"}.
            {isSmallSample(row) ? ` Only ${row.samplePoorHouseholds} poor households were surveyed here.` : ""}
          </p>
        </div>
      </div>

      {reliability && (
        <p className="mt-3 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600">
          <strong className="font-semibold text-slate-900">Reliability: {reliability.label}.</strong> {reliability.detail}
          {poverty?.reliabilityReasons?.length > 0 && ` Reasons: ${poverty.reliabilityReasons.join("; ")}.`}
        </p>
      )}

      <button type="button" onClick={() => setShowMethod((value) => !value)} aria-expanded={showMethod} aria-controls="survey-evidence-method"
        className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-900">
        {showMethod ? "Hide method and provenance" : "Show method and provenance"}
      </button>
      {showMethod && (
        <dl id="survey-evidence-method" className="mt-2 space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <div><dt className="font-medium text-slate-900">Estimator</dt><dd>{method.estimator}</dd></div>
          <div><dt className="font-medium text-slate-900">Interval methods</dt><dd>Poverty: {method.intervalMethod.poverty}. VUP participation: {method.intervalMethod.vup}.</dd></div>
          <div><dt className="font-medium text-slate-900">Degrees of freedom</dt><dd>{method.degreesOfFreedom}</dd></div>
          <div><dt className="font-medium text-slate-900">District-versus-national test</dt><dd>{method.contrast}</dd></div>
          <div><dt className="font-medium text-slate-900">Not included</dt><dd>{method.notIncluded}</dd></div>
          <div><dt className="font-medium text-slate-900">Source</dt><dd>{provenance.source} · period {provenance.period} · indicator <span className="font-mono">{provenance.indicatorId}</span></dd></div>
          <div><dt className="font-medium text-slate-900">Reproducibility</dt><dd>Dataset fingerprint <span className="break-all font-mono">{provenance.datasetSha256.slice(0, 24)}…</span> · code fingerprint <span className="break-all font-mono">{provenance.codeFingerprint.slice(0, 24)}…</span> · derived <span className="font-mono">{provenance.derivedAt}</span></dd></div>
          <div><dt className="font-medium text-slate-900">Evidence status</dt><dd>{EICV7_UNCERTAINTY.status.evidenceState}. {EICV7_UNCERTAINTY.status.note}</dd></div>
        </dl>
      )}

      {!name && <p className="mt-3 text-xs leading-5 text-slate-500">Enter one of Rwanda's 30 districts above to see its own interval, reliability and contrast against the national estimate.</p>}
      {name && !hasInterval(row.povertyInterval) && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          No interval is shown because the derived estimate could not be reconciled with the figure this dashboard displays. No precision is claimed.
        </p>
      )}
      {/* UPG-05: the same reconciliation contract the Programme Results page applies, read for this district.
          Nothing is calculated here and no administrative total is invented: with no authorised register in
          this build the panel's rows stay unresolved and say who could supply the missing side. */}
      <ReconciliationSection
        className="mt-4"
        place={name}
        title="Survey Figures and Programme Records"
        subtitle={`Why ${label}'s estimates and a beneficiary count are not the same measurement`}
        fileStem="district-reconciliation"
      />

      {/* UPG-12 Surface B: what a reader can do next with this district, limited to what their own role can open. */}
      <FeatureMiniEntry className="mt-4" ids={["action-tracking", "support-compare"]} role={role} titleKey="discover.mini.whatCanWeDo" />
    </section>
  );
}
