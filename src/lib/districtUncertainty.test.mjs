import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coverage, contrastVerdict, POINT_TOLERANCE_PP, reader, reliabilityOf } from "./districtUncertainty.js";
import { enrichRows, qualityOf, reasonToReview } from "./povertySupport.js";

const document = JSON.parse(readFileSync(new URL("../data/dashboard-eicv7-uncertainty.json", import.meta.url), "utf8"));
const aggregates = JSON.parse(readFileSync(new URL("../data/dashboard-eicv7-aggregates.json", import.meta.url), "utf8"));
const uncertainty = reader(document);

const districtRow = (name) => {
  const source = aggregates.districts.find((row) => row.name === name);
  return uncertainty.withUncertainty({ ...source });
};

test("every displayed district point reconciles with the derived estimate", () => {
  for (const row of aggregates.districts) {
    const joined = districtRow(row.name);
    assert.ok(joined.povertyEvidence, `${row.name} should have a derived record`);
    assert.ok(Math.abs(Number(joined.povertyEvidence.point.toFixed(1)) - row.poverty) <= POINT_TOLERANCE_PP,
      `${row.name}: derived point ${joined.povertyEvidence.point} vs displayed ${row.poverty}`);
  }
});

test("real design-based intervals are attached for all 30 districts", () => {
  const rows = aggregates.districts.map((row) => districtRow(row.name));
  assert.equal(rows.filter((row) => row.povertyInterval).length, 30);
  for (const row of rows) {
    assert.ok(row.povertyInterval.low < row.povertyInterval.high, `${row.name} bounds must be ordered`);
    assert.ok(row.povertyInterval.low >= 0 && row.povertyInterval.high <= 100, `${row.name} bounds must be percentages`);
    assert.ok(row.povertyInterval.low <= row.poverty + POINT_TOLERANCE_PP,
      `${row.name}: interval must not sit entirely above its own point estimate`);
    assert.ok(row.povertyInterval.high >= row.poverty - POINT_TOLERANCE_PP,
      `${row.name}: interval must not sit entirely below its own point estimate`);
  }
});

test("the national interval matches the published headcount range", () => {
  const national = uncertainty.withNationalUncertainty(aggregates.national);
  assert.equal(national.poverty, 27.4);
  assert.deepEqual(national.povertyInterval, { low: 26.4, high: 28.3 });
});

test("an interval is never attached to a number the dashboard does not show", () => {
  // Same record, but the displayed point has drifted: the join must refuse.
  const drifted = uncertainty.withUncertainty({ ...aggregates.districts[0], poverty: aggregates.districts[0].poverty + 5 });
  assert.equal(drifted.povertyInterval, null);
});

test("a non-estimable or malformed record yields no interval, never a guessed one", () => {
  const cases = [
    { ciEstimated: false, point: 20, ciLow: 10, ciHigh: 30 },
    { ciEstimated: true, point: 20, ciLow: null, ciHigh: 30 },
    { ciEstimated: true, point: 20, ciLow: 30, ciHigh: 10 },
    { ciEstimated: true, point: 20, ciLow: 10, ciHigh: 120 },
    { ciEstimated: true, point: Number.NaN, ciLow: 10, ciHigh: 30 },
    { ciEstimated: true, point: 20, ciLow: Number.NaN, ciHigh: Number.NaN },
  ];
  for (const record of cases) {
    const joined = reader({ poverty: [{ geography: record.geography ?? "Testland", ...record }], contrasts: [] })
      .withUncertainty({ name: "Testland", poverty: 20 });
    assert.equal(joined.povertyInterval, null, JSON.stringify(record));
  }
  assert.equal(reader(null).withUncertainty({ name: "Missing", poverty: 20 }).povertyInterval, null);
});

test("a district with no derived record keeps its value and shows no precision", () => {
  const joined = uncertainty.withUncertainty({ name: "NotInArtifact", poverty: 30, extremePoverty: 10, vupAmongPoor: 5 });
  assert.equal(joined.poverty, 30);
  assert.equal(joined.povertyInterval, null);
  assert.equal(joined.vupInterval, null);
  assert.equal(joined.povertyEvidence, null);
});

test("the VUP interval uses the poor-household universe and is reported separately", () => {
  const record = document.vupAmongPoor.find((row) => row.geography === "Bugesera");
  assert.equal(record.unit, "percent_of_surveyed_poor_households");
  assert.equal(record.ciMethod, "logit");
  const joined = districtRow("Bugesera");
  assert.equal(joined.vupInterval.low <= joined.vupAmongPoor, true);
  assert.ok(joined.povertyEvidence.unit === "percent_of_people" && joined.vupEvidence.unit !== joined.povertyEvidence.unit,
    "person and household universes must never be merged");
});

test("certainty is decided by the joint contrast, not by interval overlap", () => {
  const excluded = document.contrasts.find((row) => row.distinguishable);
  assert.ok(["above", "below"].includes(contrastVerdict(excluded).key));
  assert.ok(contrastVerdict(excluded).detail.includes("does not include zero"));

  const notCertain = document.contrasts.find((row) => !row.distinguishable);
  assert.equal(contrastVerdict(notCertain).key, "notDistinguishable");
  assert.ok(contrastVerdict(notCertain).detail.includes("includes zero"));

  // A negative percentage-point difference must still be readable; bounds here are
  // below zero, which an "estimate range" check would wrongly reject.
  const below = document.contrasts.find((row) => row.ciLow < 0 && row.ciHigh < 0);
  assert.equal(contrastVerdict(below).key, "below");
  assert.ok(!contrastVerdict(below).detail.includes("certified"));
});

test("a missing contrast is reported as not assessed", () => {
  assert.equal(contrastVerdict(null).key, "unknown");
  assert.equal(contrastVerdict({ difference: 3 }).key, "unknown");
  assert.equal(contrastVerdict({ difference: 3, ciLow: 1, ciHigh: 5, distinguishable: true }).key, "above");
});

test("reliability grades always carry a plain-language explanation", () => {
  assert.equal(reliabilityOf({ reliability: "high" }).label, "Reliable");
  assert.ok(reliabilityOf({ reliability: "moderate" }).detail.length > 20);
  assert.equal(reliabilityOf({ reliability: "not-a-grade" }), null);
  assert.equal(reliabilityOf(undefined), null);
  const grades = new Set(document.poverty.map((row) => row.reliability));
  for (const grade of grades) assert.ok(reliabilityOf({ reliability: grade }), `${grade} needs a label`);
});

test("coverage counts real intervals and never exceeds the district set", () => {
  const rows = aggregates.districts.map((row) => districtRow(row.name));
  const counted = coverage(rows);
  assert.equal(counted.total, 30);
  assert.equal(counted.withInterval, 30);
  assert.equal(counted.withContrast, 30);
  assert.equal(coverage([]).total, 0);
});

test("the artifact states it is not independently certified", () => {
  assert.equal(document.status.certified, false);
  assert.equal(document.status.evidenceState, "CALCULATED_ESTIMATE_PENDING_SCIENTIFIC_REVIEW");
  assert.match(document.status.note, /Independent scientific review/i);
});

test("the artifact carries the provenance the UI must surface", () => {
  const p = document.provenance;
  assert.equal(p.survey, "EICV7");
  assert.equal(p.period, "2023/24");
  assert.equal(p.datasetSha256.length, 64);
  assert.match(p.source, /NISR EICV7/);
  assert.equal(document.method.notIncluded.includes("Rank separation"), true);
});

// End-to-end over the shipped artifacts: this is the exact join the Statistics
// Dashboard performs (uncertainty reader -> district rows -> povertySupport
// markers). A district whose point estimate sits above Rwanda but whose joint
// contrast includes zero must NOT be presented as a priority signal.
test("joining the shipped artifacts downgrades a district that points alone would flag", () => {
  const national = uncertainty.withNationalUncertainty(aggregates.national);
  const joined = aggregates.districts.map((row) => uncertainty.withUncertainty(row));
  const enriched = enrichRows(joined, national);

  // Every district in the review-first quadrant carries a contrast here, so the
  // downgrade decision is made on tested evidence rather than on absence of data.
  assert.equal(enriched.filter((row) => row.quadrant.key === "reviewFirst").every((row) => row.povertyContrast), true);

  const reviewFirst = enriched.filter((row) => row.quadrant.key === "reviewFirst");
  const downgraded = reviewFirst.filter((row) => row.marker.key === "withinRange");
  assert.ok(downgraded.length > 0, "at least one district must be downgraded by its contrast, or this test proves nothing");
  assert.ok(downgraded.length < reviewFirst.length, "not every review-first district can be within range, or the flag is meaningless");

  for (const row of downgraded) {
    assert.equal(row.poverty > national.poverty, true, `${row.name} is above Rwanda on the point estimate`);
    assert.equal(row.povertyContrast.distinguishable, false, `${row.name} contrast must include zero`);
    assert.equal(row.marker.label, "Within national range");
    assert.match(reasonToReview(row), /within sampling uncertainty/);
    assert.ok(!/two signals/i.test(row.marker.label));
  }
  for (const row of reviewFirst.filter((item) => item.marker.key === "twoSignals")) {
    assert.equal(row.povertyContrast.distinguishable, true, `${row.name} keeps the flag only on a tested difference`);
  }
});

test("the shipped district set exercises every reliability grade the UI labels", () => {
  const grades = new Set([...document.poverty, ...document.vupAmongPoor].map((row) => row.reliability));
  // Low-reliability VUP estimates genuinely exist in this survey, so the warning
  // path is real data rather than a hypothetical branch.
  assert.ok(grades.has("low"), "expected at least one low-reliability estimate to exercise the warning");
  const joined = aggregates.districts.map((row) => uncertainty.withUncertainty(row));
  const flagged = joined.filter((row) => row.vupEvidence.reliability === "low" || row.povertyEvidence.reliability === "low");
  assert.ok(flagged.length > 0);
  for (const row of flagged) {
    const quality = qualityOf(row);
    // A thin sample is reported as such (it is the root cause), and any other
    // low-grade district gets the reliability warning. Neither may look clean.
    assert.ok(["small", "lowReliability"].includes(quality.key), `${row.name} -> ${quality.key}`);
    assert.notEqual(quality.tone, "ok", `${row.name} must not read as a clean estimate`);
  }
});

test("the browser artifacts name no file inside the licensed archive", () => {
  // This dashboard is published. Record names and member paths from the licensed
  // EICV7 archive are data-agreement detail, so they must not reach the bundle.
  const shipped = [
    readFileSync(new URL("../data/dashboard-eicv7-uncertainty.json", import.meta.url), "utf8"),
    readFileSync(new URL("../data/dashboard-eicv7-aggregates.json", import.meta.url), "utf8"),
  ].join("\n");
  for (const forbidden of [".dta", "Cross_Section", ".zip", "hhid"]) {
    assert.ok(!shipped.includes(forbidden), `the published bundle must not contain ${forbidden}`);
  }
  // A fuzzy term is allowed in prose; assert on the exact identifiers instead.
  assert.ok(!/"(povertyFile|householdFile|vupFiles)"/.test(shipped));
  assert.match(document.provenance.derivedFrom, /paths held in the local build/);
});

test("the browser artifact carries aggregate results only, never household records", () => {
  const allowedRecordFields = new Set([
    "geography", "unit", "definition", "point", "se", "df", "ciLow", "ciHigh", "ciMethod", "ciEstimated",
    "sampleObservations", "samplePsus", "designEffect", "coefficientOfVariation", "reliability",
    "publishable", "reliabilityReasons", "comparator", "difference", "distinguishable",
  ]);
  const allRecords = [document.national, ...document.poverty, ...document.extremePoverty,
    ...document.vupAmongPoor, ...document.contrasts, ...document.vupContrasts];
  for (const record of allRecords) {
    for (const key of Object.keys(record)) {
      assert.ok(allowedRecordFields.has(key), `unexpected field ${key} in the browser artifact`);
    }
  }
  // Counts are aggregates; no single household or PSU is identifiable from them.
  assert.equal(document.poverty.length, 30);
  assert.equal(document.contrasts.length, 30);
});
