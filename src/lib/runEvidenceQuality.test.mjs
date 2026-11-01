import test from "node:test";
import assert from "node:assert/strict";
import { reportReleaseQuality, runEvidenceQuality } from "./runEvidenceQuality.js";

// Shaped from what the governed engine writes for a scientific run: engine/ireme/science.py builds the manifest
// and the reconciliation summary, and engine/ireme/api.py returns them as
// { investigation_id, status, district, manifest, scientific_decision, reasons, differences, certified_fact_ids }.
const stage = (id, status = "done", output = "a".repeat(64)) => ({ stage_id: id, status, input_sha256: "b".repeat(64), output_sha256: output });

const runRecord = (overrides = {}) => ({
  investigation_id: "run-6f2c1a9b3d4e5f60",
  status: "restricted_draft",
  district: "Rwanda",
  scientific_decision: "methodology_review_required",
  reasons: ["Independent ownership review pending", "Production tolerances and definitions require scientific approval", "Confidence interval method differences require review"],
  certified_fact_ids: [],
  differences: [
    { quantity: "estimates", geography: "Rwanda", point_difference: 0.0004, se_difference: 0.0001, ci_methods: { python: "t_design", r: "normal" } },
    { quantity: "estimates", geography: "Kigali City", point_difference: -0.0012, se_difference: 0.0002, ci_methods: { python: "t_design", r: "normal" } },
    { quantity: "estimates", geography: "Gitarama", point_difference: 0.0310, se_difference: 0.0009, ci_methods: { python: "t_design", r: "normal" } },
    { quantity: "contrasts", geography: "Rwanda", point_difference: 0.0, se_difference: 0.0, ci_methods: { python: "t_design", r: "normal" } },
  ],
  manifest: {
    investigation_id: "run-6f2c1a9b3d4e5f60", district_id: "Rwanda", purpose: "poverty_headcount_estimation",
    created_at: "2026-10-30T09:12:44+00:00",
    data_snapshot_sha256: "c".repeat(64), indicator_registry_sha256: "d".repeat(64),
    code_commit: "e86f8e91a2b3c4d5e6f708192a3b4c5d6e7f8091", workflow_version: "science-2026-10-28",
    status: "restricted_draft", science_environment_sha256: "e".repeat(64),
    stages: [stage("primary"), stage("reference"), stage("reconciliation")],
  },
  ...overrides,
});

test("no run record means no evidence claims at all", () => {
  for (const empty of [null, undefined, {}]) {
    const quality = runEvidenceQuality(empty);
    assert.equal(quality.available, false);
    assert.equal(quality.stages, null);
    assert.equal(quality.certified, null);
    assert.equal(quality.recomputation, null);
    assert.match(quality.reason, /absent check is not a passed check/i);
    // The one thing an empty panel must never produce is a summary with figures in it.
    assert.doesNotMatch(JSON.stringify(quality), /\d/, "no count may appear when nothing was recorded");
  }
});

test("the panel reads the engine's own states instead of inventing a summary", () => {
  const quality = runEvidenceQuality(runRecord());
  assert.equal(quality.releaseState.token, "restricted_draft");
  assert.equal(quality.releaseState.label, "Restricted draft");
  assert.match(quality.releaseState.note, /Only the governed API's release gate can mark a report published/);
  assert.equal(quality.decision.token, "methodology_review_required");
  assert.equal(quality.decision.outstanding, true);
  assert.equal(quality.decision.unresolved, 3);
  assert.deepEqual(quality.decision.reasons, runRecord().reasons);
  assert.equal(quality.certified.count, 0);
  assert.match(quality.certified.note, /none may be quoted as an official result/i);
  assert.equal(quality.approvals.recorded, false, "a passing pipeline is never presented as human sign-off");
  assert.equal(quality.model.state, "unavailable", "the model status comes from the feature registry, not from this file's wording");
  assert.match(quality.model.note, /not trained, not evaluated, and not a governed release/);
});

test("the independent recomputation is Python against R, and is never called a publication match", () => {
  const quality = runEvidenceQuality(runRecord());
  assert.equal(quality.recomputation.attached, true);
  assert.equal(quality.recomputation.compared, 4);
  assert.deepEqual(quality.recomputation.quantities, ["estimates", "contrasts"]);
  assert.equal(quality.recomputation.geographies.length, 3);
  assert.equal(quality.recomputation.maxPointDifference, 0.031, "the largest gap is the one a reviewer needs first");
  assert.equal(quality.recomputation.maxSeDifference, 0.0009);
  assert.deepEqual(quality.recomputation.ciMethods, ["design-based t interval against normal approximation"]);
  assert.match(quality.recomputation.note, /still not a publication match/i);
  // The absent publication comparison stays stated as absent rather than being implied by the counts above.
  assert.equal(quality.publishedComparison.attached, false);
  assert.match(quality.publishedComparison.note, /No comparison with an NISR published table is attached/);
  assert.equal(quality.sample.recorded, false, "no sample size is invented for a run that carries none");
});

test("a run without the second implementation says nothing was recomputed", () => {
  const quality = runEvidenceQuality(runRecord({ differences: [] }));
  assert.equal(quality.recomputation.attached, false);
  assert.match(quality.recomputation.note, /nothing was independently recomputed/i);
});

test("failed, unrecognised and unverifiable stages are never folded into the passing count", () => {
  const messy = runRecord();
  messy.manifest.stages = [
    stage("primary"),
    stage("reference", "failed", null),
    stage("reconciliation", "running"),
    { status: "done", output_sha256: "f".repeat(64) }, // a stage with no name
    stage("integrity", "done", ""),                     // done, but nothing to re-derive
  ];
  const quality = runEvidenceQuality(messy);
  assert.equal(quality.stages.total, 4, "an unnamed stage cannot be reported as a checked step");
  assert.equal(quality.stages.done, 1);
  assert.deepEqual(quality.stages.failed, ["reference"]);
  assert.deepEqual(quality.stages.other, [{ stage: "reconciliation", status: "running" }]);
  assert.deepEqual(quality.stages.missingOutputHash, ["integrity"]);
  assert.match(quality.stages.note, /never counted as passed/);
  assert.doesNotMatch(quality.stages.note, /^\s*4 of 4/);
});

test("a manifest with no stages reports no checked part of the run", () => {
  const quality = runEvidenceQuality(runRecord({ manifest: { ...runRecord().manifest, stages: [] } }));
  assert.equal(quality.stages.total, 0);
  assert.equal(quality.stages.done, 0);
  assert.match(quality.stages.note, /no part of this run is shown as checked/);
});

test("provenance is counted from what is actually present", () => {
  const weak = runRecord();
  weak.manifest.code_commit = "e86f8e9";
  delete weak.manifest.science_environment_sha256;
  const quality = runEvidenceQuality(weak);
  assert.equal(quality.integrity.recorded, 3);
  assert.equal(quality.integrity.total, 4);
  assert.equal(quality.integrity.commitIsFullHash, false, "a short commit can be substituted; a full hash cannot");
  assert.equal(quality.integrity.environmentSha256, null);
});

test("a published state is only claimed when the engine recorded it", () => {
  assert.equal(runEvidenceQuality(runRecord({ status: "published" })).releaseState.note, "Released by the governed API under a recorded approval.");
  const revoked = runEvidenceQuality(runRecord({ status: "revoked" }));
  assert.equal(revoked.releaseState.label, "Revoked");
  assert.match(revoked.releaseState.note, /does not do that/);
  // An unrecognised status is quoted back rather than dressed up as a known state.
  assert.match(runEvidenceQuality(runRecord({ status: "watermarked" })).releaseState.label, /Unrecognised state "watermarked"/);
  assert.match(runEvidenceQuality({ ...runRecord(), status: null }).releaseState.label, /No state recorded/);
});

test("certified facts are reported when the engine records them, and only then", () => {
  const quality = runEvidenceQuality(runRecord({ certified_fact_ids: ["fact-poverty-rwanda"] }));
  assert.equal(quality.certified.count, 1);
  assert.deepEqual(quality.certified.ids, ["fact-poverty-rwanda"]);
  assert.match(quality.certified.note, /1 fact id the engine marks as certified/);
});

// The report endpoints return far less than the run record does. engine/ireme/api.py:
//   POST /v1/reports/{id}/review  -> {report_id, version, report_ast_sha256, status, decision:{status, reasons}}
//   POST /v1/reports/{id}/publish -> {report_id, version, status}
//   GET  /v1/reports/{id}/export  -> report bytes, never JSON
const reviewResponse = (overrides = {}) => ({
  report_id: "report-rusizi-2026-10", version: "3",
  report_ast_sha256: "f".repeat(64), status: "approved",
  decision: { status: "approve", reasons: ["Independent statistician sign-off outstanding"] },
  ...overrides,
});

test("a report response with nothing in it states no release and no approval", () => {
  for (const empty of [null, undefined, {}, { trace_id: "9c1d" }]) {
    const release = reportReleaseQuality(empty);
    assert.equal(release.available, false, JSON.stringify(empty));
    assert.equal(release.releaseState, null);
    assert.equal(release.decision, null);
    assert.equal(release.hash, null);
    assert.match(release.reason, /not an approved report/);
    // An absent record may not leak a count or a status word that reads like a result.
    assert.doesNotMatch(release.reason, /\d/);
  }
});

test("the release state comes from the status the server returned, and only published reads as released", () => {
  assert.equal(reportReleaseQuality(reviewResponse()).releaseState.label, "Reviewer-approved");
  assert.match(reportReleaseQuality(reviewResponse()).releaseState.note, /has not released this version/);
  const published = reportReleaseQuality({ report_id: "r", version: "3", status: "published" });
  assert.equal(published.releaseState.label, "Published");
  assert.match(published.releaseState.note, /recorded server-side/);
  for (const [token, label] of [["restricted_draft", "Restricted draft"], ["superseded", "Superseded"], ["revoked", "Revoked"], ["qa_failed", "Quality checks failed"]]) {
    assert.equal(reportReleaseQuality(reviewResponse({ status: token })).releaseState.label, label);
  }
  assert.match(reportReleaseQuality(reviewResponse({ status: "archived" })).releaseState.label, /Unrecognised state "archived"/);
});

test("the snapshot hash the decision binds to is checked for shape, not admired", () => {
  const bound = reportReleaseQuality(reviewResponse());
  assert.equal(bound.hash.complete, true);
  assert.match(bound.hash.note, /409 REPORT_CHANGED/);
  const truncated = reportReleaseQuality(reviewResponse({ report_ast_sha256: "abcdef" }));
  assert.equal(truncated.hash.complete, false);
  assert.equal(truncated.hash.value, "abcdef");
  assert.match(truncated.hash.note, /not a full 64-character SHA-256/);
  const absent = reportReleaseQuality({ report_id: "r", version: "3", status: "published" });
  assert.equal(absent.hash.value, null);
  assert.match(absent.hash.note, /no reviewed snapshot hash/);
});

test("the decision block keeps the engine's outstanding reasons visible", () => {
  const reviewed = reportReleaseQuality(reviewResponse());
  assert.equal(reviewed.decision.recorded, true);
  assert.equal(reviewed.decision.token, "approve");
  assert.equal(reviewed.decision.outstanding, true);
  assert.deepEqual(reviewed.decision.reasons, ["Independent statistician sign-off outstanding"]);
  const clean = reportReleaseQuality(reviewResponse({ decision: { status: "approve", reasons: [] } }));
  assert.equal(clean.decision.outstanding, false);
  assert.match(clean.decision.note, /attached no outstanding reasons/);
  // A publish response has no decision object: that is reported as absent, never as an approval.
  const published = reportReleaseQuality({ report_id: "r", version: "3", status: "published" });
  assert.equal(published.decision.recorded, false);
  assert.deepEqual(published.decision.reasons, []);
});

test("no reviewer identity and no verification registry are invented from a report response", () => {
  const release = reportReleaseQuality(reviewResponse());
  assert.equal(release.approvals.recorded, false);
  assert.match(release.approvals.note, /names no reviewer identity/);
  assert.equal(release.verification.attached, false);
  assert.match(release.verification.note, /not a passed check/);
  assert.match(release.bytes.note, /server export route/);
  const text = JSON.stringify(release);
  // The words a reviewer is not allowed to see manufactured here.
  assert.doesNotMatch(text, /peer-reviewed|scientifically approved|signed off by/i);
});
