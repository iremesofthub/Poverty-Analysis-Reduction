import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  enrichRows,
  filterRows,
  formatInterval,
  isContrastAssessed,
  isDistinguishableFromNational,
  markerFor,
  observationsFor,
  quadrantOf,
  qualityOf,
  reasonToReview,
  sortRows,
  viewToCsv,
} from "./povertySupport.js";

const data = JSON.parse(readFileSync(new URL("../data/dashboard-eicv7-aggregates.json", import.meta.url), "utf8"));
const national = data.national;
const rows = enrichRows(data.districts, national);
const byName = (name) => rows.find((row) => row.name === name);

test("source data covers 30 districts with the documented national references", () => {
  assert.equal(rows.length, 30);
  assert.equal(national.poverty, 27.4);
  assert.equal(national.vupAmongPoor, 15.9);
});

test("district values match the published dashboard rows", () => {
  const nyamagabe = byName("Nyamagabe");
  assert.equal(nyamagabe.poverty, 51.4);
  assert.equal(nyamagabe.vupAmongPoor, 18.5);
  assert.equal(nyamagabe.samplePoorHouseholds, 212);
  const kamonyi = byName("Kamonyi");
  assert.equal(kamonyi.poverty, 39.7);
  assert.equal(kamonyi.vupAmongPoor, 9.2);
});

test("quadrants follow the national reference lines", () => {
  assert.equal(quadrantOf(byName("Kamonyi"), national).key, "reviewFirst");
  assert.equal(quadrantOf(byName("Nyamagabe"), national).key, "higherBoth");
  assert.equal(quadrantOf(byName("Kicukiro"), national).key, "lowerPovertyLowVup");
  assert.equal(quadrantOf(byName("Gicumbi"), national).key, "lowerPovertyHighVup");
});

test("a district exactly on a reference line is not flagged for review", () => {
  const tied = { name: "T", poverty: national.poverty, vupAmongPoor: 1, samplePoorHouseholds: 100 };
  assert.notEqual(quadrantOf(tied, national).key, "reviewFirst");
  const tiedVup = { name: "T", poverty: 40, vupAmongPoor: national.vupAmongPoor, samplePoorHouseholds: 100 };
  assert.equal(quadrantOf(tiedVup, national).key, "higherBoth");
});

test("small samples are marked before any review flag", () => {
  const small = { name: "S", poverty: 60, vupAmongPoor: 2, samplePoorHouseholds: 49 };
  assert.equal(markerFor(small, national).key, "smallSample");
  assert.equal(markerFor({ ...small, samplePoorHouseholds: 50 }, national).key, "twoSignals");
  assert.match(reasonToReview({ ...small, marker: markerFor(small, national), quadrant: quadrantOf(small, national) }), /uncertain/);
});

test("confidence intervals are never fabricated", () => {
  for (const row of rows) {
    assert.equal(formatInterval(row.povertyInterval), "Not calculated");
    assert.equal(formatInterval(row.vupInterval), "Not calculated");
    assert.notEqual(row.quality.key, "assessed");
  }
  assert.equal(formatInterval({ low: 10, high: 20.25 }), "10.0–20.3%");
  assert.equal(qualityOf({ samplePoorHouseholds: 90, povertyInterval: { low: 1, high: 2 }, vupInterval: { low: 1, high: 2 } }).key, "assessed");
});

test("review wording never claims programme failure or a coverage gap", () => {
  for (const row of rows) {
    const text = reasonToReview(row).toLowerCase();
    assert.ok(!text.includes("coverage gap"));
    assert.ok(!/under-?funded/.test(text));
  }
});

test("sorting supports poverty, VUP and name without mutating input", () => {
  const before = rows.map((row) => row.name).join();
  assert.equal(sortRows(rows, "poverty")[0].name, "Nyamagabe");
  assert.equal(sortRows(rows, "vup")[0].vupAmongPoor, Math.max(...rows.map((row) => row.vupAmongPoor)));
  assert.equal(sortRows(rows, "name")[0].name, "Bugesera");
  assert.equal(sortRows(rows, "name", "reverse")[0].name, "Rwamagana");
  assert.equal(rows.map((row) => row.name).join(), before);
});

test("search matches district and province names, ignoring case", () => {
  assert.deepEqual(filterRows(rows, "  gisa ").map((row) => row.name), ["Gisagara"]);
  assert.equal(filterRows(rows, "").length, 30);
  assert.equal(filterRows(rows, "zzz").length, 0);
});

test("CSV export keeps the figures and adds no derived gap column", () => {
  const csv = viewToCsv(rows.slice(0, 2), national);
  const [header, first] = csv.split("\r\n");
  assert.ok(!/gap/i.test(header));
  assert.ok(header.includes("sample_poor_households"));
  assert.ok(first.startsWith('"Bugesera"'));
  assert.ok(first.includes('"Not calculated"'));
});

// A review-first quadrant is a statement about two point estimates. Once the
// design-based joint contrast against Rwanda exists, a district whose difference
// falls inside sampling uncertainty must not be presented as a priority signal.
const reviewCandidate = (contrast) => ({
  name: "Test",
  province: "Southern",
  poverty: 40,
  vupAmongPoor: 5,
  samplePoorHouseholds: 120,
  sampleHouseholds: 400,
  povertyContrast: contrast,
});

test("a review-first district whose contrast includes zero is marked within range", () => {
  const row = reviewCandidate({ difference: 3.1, ciLow: -0.4, ciHigh: 6.6, distinguishable: false });
  assert.equal(quadrantOf(row, national).key, "reviewFirst");
  assert.equal(markerFor(row, national).key, "withinRange");
  assert.equal(isDistinguishableFromNational(row), false);
  assert.equal(isContrastAssessed(row), true);
  const text = reasonToReview({ ...row, marker: markerFor(row, national), quadrant: quadrantOf(row, national) });
  assert.match(text, /includes zero/);
  assert.match(text, /within sampling uncertainty/);
  // The honest reading never asserts that support is missing.
  assert.ok(!/fails|failed|under-?funded/i.test(text));
});

test("a review-first district with a contrast that excludes zero keeps the flag", () => {
  const row = reviewCandidate({ difference: 8.2, ciLow: 4.1, ciHigh: 12.3, distinguishable: true });
  assert.equal(markerFor(row, national).key, "twoSignals");
  assert.equal(isDistinguishableFromNational(row), true);
});

test("an untested district is never labelled within range", () => {
  // Absence of a contrast is absence of a test, not evidence of equality.
  for (const contrast of [undefined, null, {}, { difference: NaN }]) {
    const row = reviewCandidate(contrast);
    assert.equal(markerFor(row, national).key, "twoSignals", `contrast ${JSON.stringify(contrast)}`);
    assert.equal(isContrastAssessed(row), false);
  }
});

test("small sample outranks the contrast marker", () => {
  const row = { ...reviewCandidate({ difference: 3, ciLow: -1, ciHigh: 7, distinguishable: false }), samplePoorHouseholds: 12 };
  assert.equal(markerFor(row, national).key, "smallSample");
});

test("observations state the interval and the contrast rather than implying certainty", () => {
  const tested = reviewCandidate({ difference: 3.1, ciLow: -0.4, ciHigh: 6.6, distinguishable: false });
  tested.povertyInterval = { low: 36.1, high: 43.9 };
  const lines = observationsFor(tested, national).join(" ");
  assert.match(lines, /between 36\.1% and 43\.9%/);
  assert.match(lines, /not clearly different/i);
  const untested = observationsFor(reviewCandidate(null), national).join(" ");
  assert.match(untested, /has not been tested/i);
  assert.ok(!/is not different/.test(untested));
});

test("CSV carries the contrast fields and says so when they are missing", () => {
  const header = viewToCsv(rows.slice(0, 1), national).split("\r\n")[0];
  for (const column of ["poverty_reliability", "vup_reliability", "contrast_vs_rwanda_points", "contrast_ci_points", "distinguishable_from_rwanda"]) {
    assert.ok(header.includes(column), column);
  }
  const bare = viewToCsv([reviewCandidate(null)], national).split("\r\n")[1];
  assert.ok(bare.includes('"not calculated"'));
  assert.ok(bare.includes('"not tested"'));
  const tested = viewToCsv([reviewCandidate({ difference: 3.1, ciLow: -0.4, ciHigh: 6.6, distinguishable: false })], national).split("\r\n")[1];
  assert.ok(tested.includes("3.1"));
  assert.ok(tested.includes('"-0.4 to 6.6"'));
  assert.ok(tested.includes('"false"'));
});

const graded = (povertyGrade, vupGrade) => ({
  name: "Test",
  province: "Southern",
  poverty: 40,
  vupAmongPoor: 5,
  samplePoorHouseholds: 120,
  sampleHouseholds: 400,
  povertyInterval: { low: 36, high: 44 },
  vupInterval: { low: 2, high: 9 },
  povertyEvidence: { reliability: povertyGrade },
  vupEvidence: { reliability: vupGrade },
});

// The reliability grade comes from the estimator, not from this file, so the
// wording has to follow it instead of always reassuring the reader.
test("a low reliability grade is reported rather than hidden behind a tick", () => {
  const low = qualityOf(graded("high", "low"));
  assert.equal(low.key, "lowReliability");
  assert.match(low.note, /coefficient of variation/i);
  assert.match(low.note, /VUP/);
  const bothLow = qualityOf(graded("low", "low"));
  assert.equal(bothLow.key, "lowReliability");
  assert.match(bothLow.note, /poverty/);
});

test("unreliable and unestimable grades are never shown as acceptable", () => {
  for (const grade of ["unreliable", "unestimable"]) {
    const quality = qualityOf(graded(grade, "high"));
    assert.equal(quality.key, "unreliable");
    assert.equal(quality.tone, "bad");
    assert.match(quality.note, /must not be used as a headline number/i);
  }
});

test("moderate grades still pass but say uncertainty is noticeable", () => {
  const quality = qualityOf(graded("high", "moderate"));
  assert.equal(quality.key, "assessed");
  assert.equal(quality.tone, "ok");
  assert.match(quality.note, /noticeable sampling uncertainty/i);
});

test("clean grades keep the short available message", () => {
  assert.deepEqual(qualityOf(graded("high", "high")), { key: "assessed", label: "Interval available", tone: "ok", note: "Confidence intervals are available." });
});

test("a thin sample still reports the sample size before any grade", () => {
  const quality = qualityOf({ ...graded("low", "low"), samplePoorHouseholds: 35 });
  assert.equal(quality.key, "small");
  assert.match(quality.note, /35 surveyed poor households/);
});
