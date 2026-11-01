import test from "node:test";
import assert from "node:assert/strict";
import { FAILURE_KINDS, describeApiFailure, describeFailures, failureNotice } from "./apiFailure.js";

const httpError = (status, message = "Server said no") => Object.assign(new Error(message), { status });

test("a missing record is 'not published' and says the check never ran", () => {
  const failure = describeApiFailure(httpError(404, "No such report version"), "report");
  assert.equal(failure.kind, FAILURE_KINDS.not_published);
  assert.match(failure.sentence, /nothing was checked against it/i);
  assert.match(failure.sentence, /not a failed check/i);
  // The distinction that matters for a reader: absence must never read as either verified or disproved.
  assert.doesNotMatch(failure.sentence, /incorrect|wrong|failed verification/i);
});

test("a withdrawn record is told apart from a missing one", () => {
  assert.equal(describeApiFailure(httpError(410), "report").kind, FAILURE_KINDS.withdrawn);
  assert.match(describeApiFailure(httpError(410), "report").sentence, /superseded or revoked/i);
});

test("a refusal is 'not permitted', and proves nothing about the contents", () => {
  const failure = describeApiFailure(httpError(403), "investigation run");
  assert.equal(failure.kind, FAILURE_KINDS.not_permitted);
  assert.match(failure.sentence, /not permitted/i);
  assert.match(failure.sentence, /Nothing about its contents is proven/i);
});

test("a network failure is 'could not reach', which is not a statement about the data", () => {
  const tagged = Object.assign(new Error("Could not reach the governed Ireme API."), { kind: "unreachable", status: 0 });
  const failure = describeApiFailure(tagged, "verification result");
  assert.equal(failure.kind, FAILURE_KINDS.unreachable);
  assert.match(failure.sentence, /check did not run/i);
  assert.match(failure.sentence, /unverified rather than wrong/i);
  // A raw fetch rejection with no status attached is the same fact.
  assert.equal(describeApiFailure(Object.assign(new Error("fetch failed"), { name: "TypeError" }), "run").kind, FAILURE_KINDS.unreachable);
  assert.equal(describeApiFailure(new Error(""), "run").kind, FAILURE_KINDS.unreachable);
});

test("a service error means the check did not complete, so there is no result to report", () => {
  const failure = describeApiFailure(httpError(503, "Worker died"), "standard error");
  assert.equal(failure.kind, FAILURE_KINDS.service_error);
  assert.match(failure.sentence, /did not complete/i);
});

test("a build with no service wired says so, instead of looking like an empty dataset", () => {
  const failure = describeApiFailure(new Error("The governed Ireme API is not configured. Set VITE_IREME_API_URL to the deployed API address."), "run");
  assert.equal(failure.kind, FAILURE_KINDS.not_configured);
  // The setup instruction is kept, because a developer reading the notice still needs it.
  assert.match(failureNotice(new Error("The governed Ireme API is not configured. Set VITE_IREME_API_URL to the deployed API address."), "run").text, /VITE_IREME_API_URL/);
});

test("a message about signing in is not filed as a data problem", () => {
  assert.equal(describeApiFailure(httpError(401), "run").kind, FAILURE_KINDS.needs_sign_in);
  assert.equal(describeApiFailure(new Error("Sign in with an authorized Supabase account to access governed research."), "run").kind, FAILURE_KINDS.needs_sign_in);
});

test("the notice keeps what the service said, including its trace id", () => {
  const error = Object.assign(httpError(404, "Report version 3 is not published."), { traceId: "abc-123" });
  const notice = failureNotice(error, "report");
  assert.match(notice.text, /No report is published at this address/);
  assert.match(notice.text, /The service said: Report version 3 is not published\./);
  assert.match(notice.text, /Trace ID: abc-123/);
  // The trace id is not printed twice when the service already included it.
  const repeated = Object.assign(httpError(404, "Not found. Trace ID: abc-123."), { traceId: "abc-123" });
  assert.equal(failureNotice(repeated, "report").text.match(/abc-123/g).length, 1);
});

test("the five states a reviewer must not confuse get five different sentences", () => {
  const sentences = [httpError(404), httpError(403), httpError(500), { name: "TypeError", message: "fetch failed" }, new Error("Supabase is not configured.")]
    .map((error) => describeApiFailure(error, "figure").sentence);
  assert.equal(new Set(sentences).size, sentences.length, "no two failure kinds may read the same");
});

test("several sections failing for several reasons are named separately, not averaged into one", () => {
  const summary = describeFailures([httpError(403), httpError(404)], "evidence section");
  assert.match(summary, /Not permitted: this account is not allowed to read it/);
  assert.match(summary, /Not published: nothing is published at that address/);
  assert.equal(summary.split(". ").length, 2, "each reason is its own sentence");
  assert.doesNotMatch(summary, /need permission or have no records/i, "the old blanket sentence must not come back");
  // The same reason twice is one fact about two sections, not two facts.
  const twice = describeFailures([httpError(404), httpError(404)], "section");
  assert.equal(twice.split(". ").length, 1);
  assert.match(twice, /2 sections/);
  assert.equal(describeFailures([], "section"), "");
});

