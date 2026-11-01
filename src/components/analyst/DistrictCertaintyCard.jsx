import React, { useMemo, useState } from "react";
import Card from "@/components/analyst/Card";
import { EICV7_UNCERTAINTY } from "@/data/dashboardEvidence";
import { contrastVerdict, coverage, reliabilityOf } from "@/lib/districtUncertainty";

const pct = (value, digits = 1) => (Number.isFinite(value) ? `${value.toFixed(digits)}%` : "Not available");
const num = (value) => (Number.isFinite(value) ? value.toFixed(2) : "Not available");

function Line({ label, value, note = null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-hairline py-1.5 last:border-0">
      <dt className="text-[11.5px] text-sub">{label}</dt>
      <dd className="text-right">
        <span className="text-[12px] font-medium tabular-nums text-ink">{value}</span>
        {note && <span className="block text-[10px] leading-snug text-[#8A94A6]">{note}</span>}
      </dd>
    </div>
  );
}

// The evidence answer to "is this district number trustworthy?". Every field is
// either present in the derived artifact or explicitly reported as unavailable;
// nothing here calculates a new statistic.
export default function DistrictCertaintyCard({ rows }) {
  const [selected, setSelected] = useState(() => [...rows].sort((a, b) => b.poverty - a.poverty)[0]?.name ?? "");
  const ordered = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  const row = ordered.find((item) => item.name === selected) ?? ordered[0];
  if (!row) return null;

  const evidence = row.povertyEvidence;
  const reliability = reliabilityOf(evidence);
  const verdict = contrastVerdict(row.povertyContrast);
  const counted = coverage(rows);
  const method = EICV7_UNCERTAINTY.method;
  const provenance = EICV7_UNCERTAINTY.provenance;

  const toneRing = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-rose-200 bg-rose-50" };

  return (
    <Card
      tour="analysis-certainty"
      title="How Certain Is This?"
      subtitle="The survey evidence behind one district figure."
      info={`Poverty counts people, so it uses the person-weighted survey universe. Reported VUP participation is a share of surveyed poor households, a different universe. The two are shown separately and are never subtracted from each other. Intervals come from the project's survey engine running on the licensed EICV7 microdata and still need independent scientific review.`}
      aiInsight={`${row.name}: ${pct(row.poverty)} of people are poor, with a 95% interval of ${row.povertyInterval ? `${pct(row.povertyInterval.low)} to ${pct(row.povertyInterval.high)}` : "not available"}. ${verdict.label}.`}
      aiContext={`NISR EICV7 ${provenance.period}. Indicator ${provenance.indicatorId}. Geography ${row.name} (${row.province}). Universe: ${method.povertyUniverse} Interval method: ${method.intervalMethod.poverty}. Dataset sha256 ${provenance.datasetSha256.slice(0)} Evidence status: ${EICV7_UNCERTAINTY.status.evidenceState}.`}
      action={
        <label className="flex items-center gap-2 text-[11px] text-sub">
          <span className="sr-only" id="certainty-district-label">District</span>
          <select
            aria-labelledby="certainty-district-label"
            value={row.name}
            onChange={(event) => setSelected(event.target.value)}
            className="rounded-md border border-hairline bg-white px-2 py-1 text-[11.5px] font-medium text-ink"
          >
            {ordered.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <div>
          <Line label="Poverty rate (share of people)" value={pct(row.poverty)} note={`95% interval: ${row.povertyInterval ? `${pct(row.povertyInterval.low)} – ${pct(row.povertyInterval.high)}` : "Not calculated"}`} />
          <Line label="Standard error" value={evidence ? `${num(evidence.se)} points` : "Not available"} />
          <Line label="Survey households / clusters" value={evidence ? `${evidence.sampleObservations} / ${evidence.samplePsus}` : "Not available"} note="Counts only; no household is identified." />
          <Line label="Design degrees of freedom" value={evidence?.df ?? "Not available"} note="PSUs minus strata for the full design." />
          <Line label="Coefficient of variation" value={evidence?.coefficientOfVariation != null ? `${(evidence.coefficientOfVariation * 100).toFixed(1)}%` : "Not available"} />
        </div>
        <div>
          <Line label="Reported VUP participation (poor households)" value={pct(row.vupAmongPoor)} note={`95% interval: ${row.vupInterval ? `${pct(row.vupInterval.low)} – ${pct(row.vupInterval.high)}` : "Not calculated"} · based on ${row.samplePoorHouseholds} surveyed poor households`} />
          <Line label="VUP reliability" value={reliabilityOf(row.vupEvidence)?.label ?? "Not assessed"} />
          <Line label="Design effect" value={evidence?.designEffect != null ? evidence.designEffect.toFixed(2) : "Not available"} note="How much clustering widens the interval versus a simple random sample." />
          <div className="mt-2 rounded-lg border border-hairline px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-sub">Difference from Rwanda</p>
            <p className="mt-1 text-[12.5px] font-medium text-ink">{verdict.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-sub">{verdict.detail}</p>
          </div>
        </div>
      </dl>

      {reliability && (
        <div className={`mt-3 rounded-lg border px-3 py-2 ${toneRing[reliability.tone] ?? "border-hairline bg-canvas"}`}>
          <p className="text-[12px] font-semibold text-ink">Reliability: {reliability.label}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-sub">{reliability.detail}</p>
          {evidence?.reliabilityReasons?.length > 0 && (
            <ul className="mt-1 list-disc pl-4 text-[11px] text-sub">
              {evidence.reliabilityReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          )}
        </div>
      )}

      <p className="mt-3 border-t border-hairline pt-2 text-[10.5px] leading-relaxed text-[#8A94A6]">
        Method: {method.estimator} Interval: {method.intervalMethod.poverty} for poverty; {method.intervalMethod.vup} for VUP participation.
        {" "}{counted.withInterval} of {counted.total} districts in the current filter carry an interval.
        Source dataset fingerprint <span className="font-mono">{provenance.datasetSha256.slice(0, 12)}…</span>, derived{" "}
        <span className="font-mono">{provenance.derivedAt}</span>.
        <strong className="ml-1 font-semibold text-amber-700">{EICV7_UNCERTAINTY.status.certified ? "Certified" : "Not independently certified — pending scientific review."}</strong>
      </p>
    </Card>
  );
}
