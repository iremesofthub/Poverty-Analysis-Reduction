import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// UPG-09's honesty rules live in three places at once: the derivation in src/lib/reportVerification.js, the
// screen that shows it, and the exported document. A change in any one of them can quietly make a report look
// better than the evidence supports, so the wiring itself is pinned here. The derivation is unit-tested in
// reportVerification.test.mjs and against the shipped Rusizi fixture in rusiziReport.test.mjs.
const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const section = read("../components/investigation/VerificationSection.jsx");
const exporter = read("../components/investigation/reportExport.js");
const engine = read("../pages/AIEngine.jsx");
const runPanel = read("../components/investigation/RunEvidencePanel.jsx");
const derivation = read("../lib/runEvidenceQuality.js");
const api = read("../lib/iremeApi.js");
const policy = read("../lib/exportPolicy.js");

// Only the part inside the evidence-quality box is inspected, so the rest of the report cannot mask a regression.
const qualityBlock = (source) => {
  const start = source.indexOf("export function EvidenceQuality");
  assert.notEqual(start, -1, "the evidence quality block must exist in the report view");
  return source.slice(start, source.indexOf("\nexport default", start));
};

test("the evidence quality box shows derived counts and never a typed-in number", () => {
  const block = qualityBlock(section);
  assert.match(section, /<EvidenceQuality quality=\{section\.quality\} \/>/, "the report view mounts the derived summary");
  assert.match(section, /data-testid="evidence-quality"/);
  // Every count in the box comes from the derivation. Nothing here may hand a status a number.
  assert.doesNotMatch(block, /(verified_match|discrepancy_requires_review|methodology_mismatch|not_externally_verified|new_analytical_finding):\s*\d/);
  assert.match(block, /quality\.statuses\.map/, "the five statuses are printed from the recount");
  assert.match(block, /Recounted from the \{quality\.totals\.registry\} checks recorded by the engine/);
  // A disagreement between the payload's summary and its own registry is surfaced, not resolved silently.
  assert.match(block, /quality\.countsMatchSummary === false/);
  assert.match(block, /do not agree/);
  // The absence of a human decision is stated, because a passing count is not sign-off.
  assert.match(block, /quality\.approvals\.note/);
  assert.doesNotMatch(block, /certified|scientifically approved|peer-reviewed/i);
});

test("a report with no evidence check gets no numbers rather than a clean bill of health", () => {
  const block = qualityBlock(section);
  assert.match(block, /if \(!quality\?\.available\) return null/, "the box disappears when nothing was recorded");
  assert.match(section, /Evidence check not run/, "the summary that replaces it says the check did not run");
});

test("the exported document carries the same evidence-quality facts as the screen", () => {
  assert.match(exporter, /### Evidence quality/);
  assert.match(exporter, /Recounted from the \$\{quality\.totals\.registry\} checks recorded by the engine/);
  assert.match(exporter, /Human scientific review: \$\{quality\.approvals\.note\}/);
  assert.match(exporter, /A passing count is not a release decision/);
  // The markdown must not be able to disagree with the view: both print from the same derived object.
  assert.match(exporter, /check\.quality/);
  assert.doesNotMatch(exporter, /Verified match: \d/, "no status count is written by hand in the exporter");
});

test("every governed failure is classified before it reaches the reader", () => {
  assert.match(engine, /import \{ describeApiFailure, describeFailures, failureNotice \} from "@\/lib\/apiFailure"/);
  assert.doesNotMatch(engine, /text: error\.message/, "a raw exception string is never the whole explanation");
  assert.ok((engine.match(/failedNotice\(error, "[^"]+"\)/g) || []).length >= 10, "each governed call site names what it was reading");
  // The sentence that merged "not permitted" with "not published" must not come back.
  assert.doesNotMatch(engine, /need permission or have no records/i);
  assert.match(engine, /describeFailures\(failed\.map\(\(item\) => item\.reason\), "related section"\)/);
  // A transport failure is tagged as one, so it cannot be read as a result about the figures.
  assert.match(api, /kind: "unreachable"/);
});

test("an unread catalogue is not shown as an empty workspace", () => {
  assert.match(engine, /\{!runs\.length && !catalog\?\.loading && !catalog\?\.error && /, '"No runs yet" is only said when the read succeeded');
  assert.match(engine, /failureNotice\(failed\.reason, "run, permission and indicator catalog"\)/);
});

test("the release gate still treats a missing evidence check as a blocker", () => {
  assert.match(policy, /if \(!verification\.available\) blockers\.push\("verification_incomplete"\)/);
  assert.match(policy, /released_by_server/);
});

test("the governed workspace shows evidence quality from the run record, not from a written summary", () => {
  assert.match(engine, /const quality = runEvidenceQuality\(investigation\);/);
  assert.match(engine, /<RunEvidencePanel quality=\{quality\} \/>/, "the live Evidence view mounts the panel");
  assert.match(runPanel, /data-testid="run-evidence-quality"/);
  assert.match(runPanel, /quality\.reason/, "a run with no record says so instead of showing figures");
  // The panel prints only derived fields. A count typed into a component is a count that can drift from the run.
  assert.doesNotMatch(runPanel, />\s*\d+\s*(of|checks|figures|values)\b/, "no hand-written counts");
  assert.match(runPanel, /\{stages\.note\}/);
  assert.match(runPanel, /\{recomputation\.note\}/);
  assert.match(runPanel, /\{publishedComparison\.note\}/);
  assert.match(runPanel, /\{approvals\.note\}/);
  assert.match(runPanel, /not recorded/, "an absent value stays labelled absent");
  // Four different facts must stay four different sentences in the derivation.
  assert.match(derivation, /item\.status === STAGE_FAILED/);
  assert.match(derivation, /missingOutputHash/);
  assert.match(derivation, /attached: false,\s*\n?\s*note: "No comparison with an NISR published table/);
  assert.match(derivation, /sample: \{\s*\n\s*recorded: false/);
  // A model status claimed here would be the app grading itself; it comes from the feature registry instead.
  assert.match(derivation, /import \{ featureById \} from "\.\/judgeFeatureRegistry\.js"/);
  assert.match(derivation, /featureById\("model-evaluation"\)/);
});

test("the governed report view states the release state the server returned and invents no signature", () => {
  const reportBlock = runPanel.slice(runPanel.indexOf("export function ReportReleasePanel"));
  assert.ok(runPanel.includes("export function ReportReleasePanel"), "the release read-out must exist beside the run read-out");
  assert.match(engine, /import \{ reportReleaseQuality, runEvidenceQuality \} from "@\/lib\/runEvidenceQuality"/);
  assert.match(engine, /const release = reportReleaseQuality\(reportRecord\);/);
  assert.match(engine, /<ReportReleasePanel quality=\{release\} \/>/, "the live Reports view mounts the derived release state");
  // The form used to declare that the demo had the approval chain bypassed. Bypasses are a server state that is
  // read from the control endpoint on the Access tab; a screen may not assert one it has not read.
  assert.doesNotMatch(engine, /with human approvals bypassed in the demo/i);
  assert.match(engine, /\/v1\/admin\/bypass\/status/);
  assert.match(reportBlock, /data-testid="report-release-quality"/);
  // Everything printed is a field of the response or of the derivation, including the four absences.
  for (const field of ["releaseState.note", "hash.note", "approvals.note", "verification.note", "bytes.note", "decision.note"]) {
    assert.match(reportBlock, new RegExp(`\\{${field.replace(".", "\\.")}\\}`), `${field} is printed from the derivation`);
  }
  assert.match(reportBlock, /\{releaseState\.label\}/);
  assert.doesNotMatch(reportBlock, /peer-reviewed|scientifically approved|signed off by/i, "no approval language that the response did not return");
  assert.doesNotMatch(reportBlock, />\s*\d+\s*(of|checks|figures|values)\b/, "no hand-written counts");
  // The derivation itself refuses to read a review decision out of a publish response.
  assert.match(derivation, /export function reportReleaseQuality/);
  assert.match(derivation, /names no reviewer identity/);
  assert.match(derivation, /no review decision object/);
});
