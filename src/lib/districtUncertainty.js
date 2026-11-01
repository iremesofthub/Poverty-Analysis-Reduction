// Design-based uncertainty for the EICV7 district estimates (UPG-01).
//
// The numbers come from `tools/analysis/derive_dashboard_uncertainty.py`, which
// runs the repository's primary estimator (`engine/ireme/survey.py`) over the
// licensed EICV7 microdata. Nothing in this file calculates a statistic: it
// joins the published aggregate rows to that artifact and refuses to attach an
// interval to a number it cannot confirm is the same number.
//
// Two universes are kept apart on purpose:
//   poverty / extreme poverty  -> share of PEOPLE      (person weights)
//   VUP participation          -> share of surveyed POOR HOUSEHOLDS (household weights)
// No function here subtracts one universe from the other.
//
// The functions take the uncertainty document as an argument so they can be
// tested directly under `node --test`, the same way `povertySupport.js` is.

// A derived point must agree with the value the dashboard actually shows before
// its interval is used. The aggregate file is rounded to one decimal, so half of
// that rounding step is the tolerance; anything wider means the two artifacts
// came from different runs and the interval is dropped.
export const POINT_TOLERANCE_PP = 0.05;

const round = (value, digits) => Number(value.toFixed(digits));
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const isPercent = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

const indexBy = (records) => new Map((records ?? []).map((record) => [record.geography, record]));

export function reader(document) {
  const poverty = indexBy(document?.poverty);
  const extreme = indexBy(document?.extremePoverty);
  const vup = indexBy(document?.vupAmongPoor);
  const contrast = indexBy(document?.contrasts);
  const vupContrast = indexBy(document?.vupContrasts);
  const national = document?.national ?? null;

  // Fail closed: an interval only exists when the artifact says it is estimable,
  // both bounds are real percentages in the right order, and the derived point
  // still matches the displayed one.
  function usableInterval(record, displayedPoint) {
    if (!record || record.ciEstimated !== true) return null;
    const { ciLow, ciHigh, point } = record;
    if (!isPercent(ciLow) || !isPercent(ciHigh) || ciLow >= ciHigh) return null;
    if (!finite(point) || !finite(displayedPoint)) return null;
    if (Math.abs(round(point, 1) - displayedPoint) > POINT_TOLERANCE_PP) return null;
    return { low: round(ciLow, 1), high: round(ciHigh, 1) };
  }

  function withUncertainty(row) {
    const povertyRecord = poverty.get(row.name) ?? null;
    const extremeRecord = extreme.get(row.name) ?? null;
    const vupRecord = vup.get(row.name) ?? null;
    return {
      ...row,
      povertyInterval: usableInterval(povertyRecord, row.poverty),
      extremePovertyInterval: usableInterval(extremeRecord, row.extremePoverty),
      vupInterval: usableInterval(vupRecord, row.vupAmongPoor),
      povertyEvidence: povertyRecord,
      extremeEvidence: extremeRecord,
      vupEvidence: vupRecord,
      povertyContrast: contrast.get(row.name) ?? null,
      vupContrast: vupContrast.get(row.name) ?? null,
    };
  }

  function withNationalUncertainty(nationalRow) {
    return {
      ...nationalRow,
      povertyInterval: usableInterval(national, round(national?.point ?? Number.NaN, 1)),
      povertyEvidence: national,
    };
  }

  return {
    withUncertainty,
    withNationalUncertainty,
    usableInterval,
    nationalRecord: national,
    contrastFor: (name) => contrast.get(name) ?? null,
    document,
  };
}

export const RELIABILITY_LABELS = {
  high: { label: "Reliable", tone: "ok", detail: "The survey sample for this district is large enough that the estimate is stable." },
  moderate: { label: "Use with caution", tone: "warn", detail: "Sampling uncertainty is noticeable; the true district value may differ by the interval shown." },
  low: { label: "Low reliability", tone: "warn", detail: "Uncertainty is high (coefficient of variation 30% or more). Do not use as a headline figure." },
  unreliable: { label: "Too small to rely on", tone: "bad", detail: "The domain falls below the minimum sample or PSU counts, so the figure is not publishable." },
  unestimable: { label: "Not estimable", tone: "bad", detail: "The design cannot produce a variance for this domain." },
};

export const reliabilityOf = (record) => RELIABILITY_LABELS[record?.reliability] ?? null;

// Plain-language answer to "is this district really different from Rwanda?".
// This uses the joint district-versus-national contrast computed with the design
// covariance. Interval overlap is never used as the test, because a district and
// the nation share households and the two intervals are not independent.
export function contrastVerdict(record) {
  // A contrast is in percentage POINTS and may be negative, so bounds are checked
  // for finiteness rather than for the 0-100 range an estimate must sit in.
  if (!record || !finite(record.difference) || !finite(record.ciLow) || !finite(record.ciHigh)) {
    return {
      key: "unknown",
      label: "Difference from Rwanda not assessed",
      detail: "A validated joint contrast is not available for this district, so no claim of a real difference is made.",
    };
  }
  const above = record.difference > 0;
  const magnitude = Math.abs(record.difference).toFixed(1);
  if (record.distinguishable) {
    return {
      key: above ? "above" : "below",
      label: `Real difference ${above ? "above" : "below"} Rwanda`,
      detail: `${magnitude} points ${above ? "above" : "below"} Rwanda. The joint survey contrast puts the difference between ${record.ciLow} and ${record.ciHigh} points, which does not include zero, so this is more than sampling noise.`,
    };
  }
  return {
    key: "notDistinguishable",
    label: "Not clearly different from Rwanda",
    detail: `${magnitude} points ${above ? "above" : "below"} Rwanda, but the joint survey contrast interval (${record.ciLow} to ${record.ciHigh} points) includes zero. The gap is within sampling uncertainty, so treat this district as average until stronger evidence exists.`,
  };
}

// How much of the displayed district set actually carries intervals and contrasts,
// so the UI can state coverage instead of implying complete uncertainty bounds.
export function coverage(rows) {
  const withInterval = rows.filter((row) => row.povertyInterval).length;
  const withContrast = rows.filter((row) => row.povertyContrast && finite(row.povertyContrast.difference)).length;
  return { total: rows.length, withInterval, withContrast };
}

// A ranking sorted by point estimates does not imply real rank separation. This
// reports the ordering only as an observation and never as a certified ranking.
export function rankCaution(rows) {
  const intervals = coverage(rows);
  if (!intervals.withInterval) {
    return "Districts are listed by their survey point estimates. No uncertainty bounds are available, so the order itself is uncertain.";
  }
  return `Districts are listed by their survey point estimates out of ${intervals.total}. Overlapping intervals mean the ranking is not a certified order: ${intervals.withInterval} districts carry a 95% interval, and rank separation would need resampling that has not been run.`;
}
