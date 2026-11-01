// UPG-09 evidence-quality contract tests. Run with `npm test` (node --test). The panel these tests cover is
// the one a judge reads to decide how much of the report was actually checked, so the rules under test are
// the honesty rules: counts come from the registry, a check that did not run produces no numbers, and
// "failed", "cannot be compared" and "nothing to check against" stay three separate facts.
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evidenceQualitySummary } from "./reportVerification.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, "fixtures/rusizi-verification.json"), "utf8"));

const claim = (overrides = {}) => ({
  indicator: "A rate", survey_period: "2023/24", unit: "percent of people",
  verification_status: "verified_match", methodology_comparable: true, estimate_type: "observed",
  source_document: "Some NISR report", ...overrides,
});
const payload = (registry, extra = {}) => ({ status: "Completed", generated_at: "2026-10-29T12:07:20+00:00", registry, sources: [], ...extra });

test("the counts are a recount of the registry, not the number the payload claims about itself", () => {
  const registry = [claim(), claim({ verification_status: "discrepancy_requires_review" }), claim({ verification_status: "not_externally_verified" })];
  const summary = evidenceQualitySummary(payload(registry, { summary: { total: 99, counts: { verified_match: 99 } } }));
  assert.equal(summary.counts.verified_match, 1);
  assert.equal(summary.counts.discrepancy_requires_review, 1);
  assert.equal(summary.totals.registry, 3);
  assert.equal(summary.totals.summaryTotal, 99, "the declared total is kept so the disagreement is visible");
  assert.equal(summary.countsMatchSummary, false, "a payload that over-reports itself must be flagged");
});

test("a payload that agrees with its own registry is not flagged", () => {
  const registry = [claim(), claim({ verification_status: "methodology_mismatch" })];
  const summary = evidenceQualitySummary(payload(registry, { summary: { total: 2, counts: { verified_match: 1, discrepancy_requires_review: 0, methodology_mismatch: 1, not_externally_verified: 0, new_analytical_finding: 0 } } }));
  assert.equal(summary.countsMatchSummary, true);
  assert.deepEqual(summary.unexpectedStatuses, []);
});

test("a status the interface has no label for is reported instead of dropped", () => {
  const summary = evidenceQualitySummary(payload([claim(), claim({ verification_status: "awaiting_a_reviewer" })]));
  assert.deepEqual(summary.unexpectedStatuses, ["awaiting_a_reviewer"]);
  assert.equal(summary.totals.registry, 2, "the unknown claim still counts toward what was checked");
  assert.ok(!JSON.stringify(summary.statuses).includes("awaiting_a_reviewer"), "it is not presented as one of the five known outcomes");
});

test("no evidence check means no numbers, not a clean pass", () => {
  for (const verification of [undefined, null, { status: "Failed", reason: "the verifier crashed" }, { status: "Completed", registry: [] }]) {
    const summary = evidenceQualitySummary(verification);
    assert.equal(summary.available, false, `${JSON.stringify(verification)}: an absent or empty registry is not a pass`);
    assert.deepEqual(summary.statuses, []);
    assert.equal(summary.totals, null);
    assert.equal(summary.sources, null);
    assert.doesNotMatch(JSON.stringify(summary.counts), /[1-9]/, "no count may appear when nothing was checked");
  }
  assert.equal(evidenceQualitySummary({ status: "Failed", reason: "the verifier crashed" }).reason, "the verifier crashed");
});

test("a document that could not be read, a figure with nothing published to compare, and a claim with no source at all stay separate", () => {
  const summary = evidenceQualitySummary(payload(
    [claim(), claim({ verification_status: "not_externally_verified", source_document: null }), claim({ verification_status: "methodology_mismatch", methodology_comparable: false })],
    { sources: [{ title: "Readable report", available: true }, { title: "Unreachable report", available: false, error: "timeout" }, { title: "Gone report", available: false }] },
  ));
  assert.deepEqual(
    { total: summary.sources.total, retrieved: summary.sources.retrieved, failed: summary.sources.failedToRetrieve.map((item) => item.title), unexplained: summary.sources.unavailableWithoutReason },
    { total: 3, retrieved: 1, failed: ["Unreachable report"], unexplained: 1 },
  );
  assert.deepEqual(summary.sources.claimsWithoutSource, ["A rate"], "only the claim that names no document");
  assert.equal(summary.counts.not_externally_verified, 1, "not checkable is not counted as a failure");
  assert.equal(summary.counts.discrepancy_requires_review, 0, "and a failure would not be counted here either");
  assert.equal(summary.comparability.notComparable, 1, "definitions that differ are their own fact");
});

test("modelled estimates are separated from observed ones, because they are not the same kind of claim", () => {
  const summary = evidenceQualitySummary(payload([claim(), claim({ estimate_type: "modelled" }), claim({ estimate_type: "modelled" })]));
  assert.deepEqual(summary.estimates, { observed: 1, modelled: 2 });
});

test("an unattempted method review says so instead of reporting zero checks passed", () => {
  assert.deepEqual(evidenceQualitySummary(payload([claim()])).checks, { status: "not_run", passed: 0, needsReview: 0, total: 0 });
  const reviewed = evidenceQualitySummary(payload([claim()], {
    methods_review: { decomposition: { status: "Completed", checks: [{ check: "additivity", passed: true }, { check: "sign convention", passed: false }] } },
  }));
  assert.deepEqual(reviewed.checks, { status: "Completed", passed: 1, needsReview: 1, total: 2 });
});

test("no human approval is inferred from a passing count", () => {
  const summary = evidenceQualitySummary(payload([claim(), claim(), claim()]));
  assert.equal(summary.approvals.recorded, false);
  assert.match(summary.approvals.note, /No human reviewer approval/i);
});

test("the shipped Rusizi verification produces the same numbers the table shows", () => {
  const summary = evidenceQualitySummary(fixture.verification || fixture);
  assert.equal(summary.available, true);
  assert.equal(summary.totals.registry, 10);
  assert.deepEqual(summary.counts, { verified_match: 7, discrepancy_requires_review: 0, methodology_mismatch: 2, not_externally_verified: 1, new_analytical_finding: 0 });
  assert.equal(summary.countsMatchSummary, true, "the fixture's own summary must agree with the recount");
  assert.deepEqual(summary.periods, ["2023/24"]);
  assert.equal(summary.sources.total, 3);
  assert.equal(summary.sources.retrieved, 3, "every official document the check read is accounted for");
  assert.equal(summary.sources.failedToRetrieve.length, 0);
  assert.deepEqual(summary.sources.claimsWithoutSource, ["Poor households reporting VUP participation (district)"], "the one figure with no published counterpart says so");
  assert.ok(summary.auditSteps > 0, "the audit trail length is reported, not invented");
  assert.equal(summary.unresolved, 0);
});
