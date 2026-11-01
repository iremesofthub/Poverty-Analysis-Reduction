// Pure helpers for the Poverty & Social Support section.
//
// Everything here works on the EICV7 district aggregates in
// data/dashboard-eicv7-aggregates.json and never invents values: confidence
// intervals are only passed through when the source row supplies them.
//
// Poverty is a share of PEOPLE; VUP participation is a share of surveyed POOR
// HOUSEHOLDS. The two have different denominators, so no helper here subtracts
// one from the other.

// Display rule carried over from the existing dashboard: a district estimate
// built on fewer than 50 surveyed poor households is flagged as a small sample.
// This is a dashboard convention, not an NISR publication threshold.
export const SMALL_SAMPLE_POOR_HOUSEHOLDS = 50;

export const QUADRANTS = {
  reviewFirst: {
    key: "reviewFirst",
    label: "Review first",
    detail: "Higher poverty, lower VUP participation",
  },
  higherBoth: {
    key: "higherBoth",
    label: "Higher poverty, higher VUP",
    detail: "Higher poverty, higher VUP participation",
  },
  lowerPovertyLowVup: {
    key: "lowerPovertyLowVup",
    label: "Lower poverty, lower VUP",
    detail: "Lower poverty, lower VUP participation",
  },
  lowerPovertyHighVup: {
    key: "lowerPovertyHighVup",
    label: "Lower poverty, higher VUP",
    detail: "Lower poverty, higher VUP participation",
  },
};

// A district sitting exactly on a reference line counts as "higher" on that axis
// only when strictly above it, so a tie never creates a review flag.
export function quadrantOf(row, national) {
  const highPoverty = row.poverty > national.poverty;
  const lowVup = row.vupAmongPoor < national.vupAmongPoor;
  if (highPoverty) return lowVup ? QUADRANTS.reviewFirst : QUADRANTS.higherBoth;
  return lowVup ? QUADRANTS.lowerPovertyLowVup : QUADRANTS.lowerPovertyHighVup;
}

export const isSmallSample = (row) => row.samplePoorHouseholds < SMALL_SAMPLE_POOR_HOUSEHOLDS;

export const hasInterval = (interval) =>
  Boolean(interval) && Number.isFinite(interval.low) && Number.isFinite(interval.high);

export function formatInterval(interval) {
  return hasInterval(interval) ? `${interval.low.toFixed(1)}–${interval.high.toFixed(1)}%` : "Not calculated";
}

// Review marker. Order matters: a small sample is reported first because the
// other two markers are not reliable on a thin sample.
//
// When the row carries a validated joint contrast against the national estimate
// (row.povertyContrast, from `districtUncertainty.js`), a district whose poverty
// rate is NOT distinguishable from Rwanda is never presented as a priority
// signal. A point difference inside sampling uncertainty is not a finding.
export function markerFor(row, national) {
  if (isSmallSample(row)) return { key: "smallSample", label: "Small sample", tone: "warn" };
  const quadrant = quadrantOf(row, national);
  if (quadrant.key === "reviewFirst") {
    if (!isDistinguishableFromNational(row)) {
      return { key: "withinRange", label: "Within national range", tone: "muted" };
    }
    return { key: "twoSignals", label: "Two signals", tone: "brand" };
  }
  if (row.poverty > national.poverty) return { key: "highPoverty", label: "High poverty", tone: "neutral" };
  return { key: "noFlag", label: "No flag", tone: "muted" };
}

// True when the joint district-versus-national contrast exists and excludes zero.
// Unknown is deliberately NOT treated as distinguishable, so no flag is invented,
// but it is also not treated as "within range" when the test simply was not run.
export function isDistinguishableFromNational(row) {
  const contrast = row?.povertyContrast;
  if (!contrast || typeof contrast.distinguishable !== "boolean") return true;
  return contrast.distinguishable;
}

export function isContrastAssessed(row) {
  const contrast = row?.povertyContrast;
  return Boolean(contrast && Number.isFinite(contrast.difference));
}

// Data-quality pill. Order matters:
// 1. a thin district sample (the dashboard display rule) is reported first, because
//    every other judgement is weaker on a thin sample and the charts encode it;
// 2. then no attachable interval, so no precision is claimed;
// 3. then the design-based reliability grade from `reliability_grade` in
//    engine/ireme/survey.py (CV bands plus minimum observation and PSU counts),
//    worst measure first. A "low" grade is genuinely present in this dataset:
//    several districts' VUP figures rest on few enough poor households that the
//    coefficient of variation is 30% or more, so they must not read as headline numbers.
export function qualityOf(row) {
  const povertyGrade = row.povertyEvidence?.reliability;
  const vupGrade = row.vupEvidence?.reliability;
  const weakest = ["unreliable", "unestimable", "low", "moderate"].find((grade) =>
    povertyGrade === grade || vupGrade === grade,
  );
  const weakestMeasure = povertyGrade === weakest ? "poverty" : "VUP";
  if (isSmallSample(row)) {
    return {
      key: "small",
      label: "Small sample",
      tone: "warn",
      note: `Only ${row.samplePoorHouseholds} surveyed poor households. Treat the VUP figure as a rough indication.`,
    };
  }
  if (!hasInterval(row.povertyInterval) && !hasInterval(row.vupInterval)) {
    return {
      key: "unassessed",
      label: "Uncertainty not assessed",
      tone: "neutral",
      note: "No confidence interval could be attached to this estimate, so no precision is claimed.",
    };
  }
  if (weakest === "unreliable" || weakest === "unestimable") {
    return {
      key: "unreliable",
      label: "Not publishable",
      tone: "bad",
      note: `The survey design marks this district's ${weakestMeasure} figure ${weakest}: it fails the minimum sample or reliability policy, so it must not be used as a headline number.`,
    };
  }
  if (weakest === "low") {
    return {
      key: "lowReliability",
      label: "Low reliability",
      tone: "warn",
      note: `The coefficient of variation for this district's ${weakestMeasure} estimate is 30% or more, so the true value could sit well away from the figure shown.`,
    };
  }
  return {
    key: "assessed",
    label: "Interval available",
    tone: "ok",
    note: weakest === "moderate"
      ? `Design-based intervals are available. The ${weakestMeasure} estimate has noticeable sampling uncertainty, so read small differences with care.`
      : "Confidence intervals are available.",
  };
}

export function enrichRows(rows, national) {
  return rows.map((row) => ({
    ...row,
    quadrant: quadrantOf(row, national),
    marker: markerFor(row, national),
    quality: qualityOf(row),
  }));
}

export const SORTERS = {
  poverty: { label: "Poverty rate", compare: (a, b) => b.poverty - a.poverty || a.name.localeCompare(b.name) },
  vup: { label: "VUP participation", compare: (a, b) => b.vupAmongPoor - a.vupAmongPoor || a.name.localeCompare(b.name) },
  name: { label: "District name", compare: (a, b) => a.name.localeCompare(b.name) },
  sample: { label: "Sample size", compare: (a, b) => b.samplePoorHouseholds - a.samplePoorHouseholds || a.name.localeCompare(b.name) },
};

export function sortRows(rows, key = "poverty", direction = "default") {
  const sorter = SORTERS[key] || SORTERS.poverty;
  const sorted = [...rows].sort(sorter.compare);
  // "default" keeps each sorter's natural direction (high to low, A to Z).
  return direction === "reverse" ? sorted.reverse() : sorted;
}

export function filterRows(rows, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(text) || String(row.province || "").toLowerCase().includes(text));
}

// Plain observations. These restate the data; they never interpret it.
export function observationsFor(row, national) {
  const side = (value, reference) => (value > reference ? "above" : value < reference ? "below" : "equal to");
  const lines = [
    `Poverty is ${row.poverty.toFixed(1)}% of people, ${side(row.poverty, national.poverty)} the national ${national.poverty.toFixed(1)}%.`,
    `${row.vupAmongPoor.toFixed(1)}% of surveyed poor households report VUP participation, ${side(row.vupAmongPoor, national.vupAmongPoor)} the national ${national.vupAmongPoor.toFixed(1)}%.`,
    `The VUP figure comes from ${row.samplePoorHouseholds} surveyed poor households (${row.sampleHouseholds} households surveyed in total).`,
  ];
  if (hasInterval(row.povertyInterval)) {
    lines.push(`The survey design puts this district's poverty rate between ${row.povertyInterval.low.toFixed(1)}% and ${row.povertyInterval.high.toFixed(1)}% (95% interval).`);
  }
  if (!hasInterval(row.vupInterval)) {
    lines.push("No confidence interval is available for the VUP figure, so small differences from the national value may not be real.");
  }
  if (!isContrastAssessed(row)) {
    lines.push("Whether this district differs from Rwanda has not been tested with a joint survey contrast, so no claim of a real difference is made.");
  } else if (!isDistinguishableFromNational(row)) {
    lines.push("Tested against Rwanda with a joint survey contrast, this district's poverty rate is not clearly different once sampling uncertainty is taken into account.");
  }
  return lines;
}

// Interpretation text is deliberately cautious: it says why a district may be
// worth a closer look, never that a programme has failed.
export function reasonToReview(row) {
  const key = row.quadrant?.key;
  if (row.marker?.key === "smallSample") {
    return "Few poor households were surveyed here, so the figures are uncertain. Check them against other evidence before drawing any conclusion.";
  }
  if (row.marker?.key === "withinRange") {
    return "This district's poverty rate sits above the national figure on the point estimate, but the survey contrast against Rwanda includes zero. The difference is within sampling uncertainty, so this is not a priority signal on its own. Reported VUP participation is a separate measure of surveyed poor households and is not compared against the poverty rate.";
  }
  if (key === "reviewFirst") {
    return "Poverty is above the national rate while reported VUP participation among poor households is below its national rate, and the survey contrast shows the poverty difference is larger than sampling uncertainty. This is a reason to look at the evidence more closely. It does not show that support is missing or that a programme has failed.";
  }
  if (key === "higherBoth") {
    return "Poverty is above the national rate. Reported VUP participation among poor households is also at or above its national rate.";
  }
  if (key === "lowerPovertyLowVup") {
    return "Poverty is at or below the national rate. Reported VUP participation among poor households is below its national rate, which may be expected where fewer households are poor.";
  }
  return "Poverty is at or below the national rate, and reported VUP participation among poor households is at or above its national rate.";
}

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

// The CSV repeats what the chart shows and adds no derived "gap" column. Where a
// design-based interval or joint contrast exists it is exported; where it does
// not, the cell says so instead of leaving a blank that could be misread as zero.
export function viewToCsv(rows, national) {
  const header = [
    "district",
    "province",
    "poverty_people_2023_24_pct",
    "vup_participation_surveyed_poor_households_2023_24_pct",
    "sample_poor_households",
    "sample_households",
    "poverty_ci_pct",
    "vup_ci_pct",
    "poverty_reliability",
    "vup_reliability",
    "contrast_vs_rwanda_points",
    "contrast_ci_points",
    "distinguishable_from_rwanda",
    "data_quality",
    "review_marker",
    "poverty_vs_national_reference",
    "vup_vs_national_reference",
  ];
  const side = (value, reference) => (value > reference ? "above" : value < reference ? "below" : "equal");
  const contrastText = (record, key) => (record && Number.isFinite(record[key]) ? record[key] : "not calculated");
  const body = rows.map((row) => [
    row.name,
    row.province,
    row.poverty,
    row.vupAmongPoor,
    row.samplePoorHouseholds,
    row.sampleHouseholds,
    formatInterval(row.povertyInterval),
    formatInterval(row.vupInterval),
    row.povertyEvidence?.reliability ?? "not assessed",
    row.vupEvidence?.reliability ?? "not assessed",
    contrastText(row.povertyContrast, "difference"),
    row.povertyContrast && Number.isFinite(row.povertyContrast.ciLow) && Number.isFinite(row.povertyContrast.ciHigh)
      ? `${row.povertyContrast.ciLow.toFixed(1)} to ${row.povertyContrast.ciHigh.toFixed(1)}`
      : "not calculated",
    row.povertyContrast && typeof row.povertyContrast.distinguishable === "boolean"
      ? String(row.povertyContrast.distinguishable)
      : "not tested",
    qualityOf(row).label,
    markerFor(row, national).label,
    side(row.poverty, national.poverty),
    side(row.vupAmongPoor, national.vupAmongPoor),
  ]);
  return [header, ...body].map((record) => record.map(csvCell).join(",")).join("\r\n");
}
