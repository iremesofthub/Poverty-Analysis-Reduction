// One place that turns a failed API call into a sentence that says which kind of failure it was.
//
// This matters for evidence quality because the five cases below carry completely different meanings for a
// reader of a report:
//   - "not published"  - nothing exists at that address. The figure was never checked, so it must not be
//                        described as verified, and it must not be described as a failed check either;
//   - "withdrawn"      - something existed and was superseded or revoked. Reading it again is the wrong act;
//   - "not permitted"  - the record may exist but this account cannot read it. Nothing is proven either way;
//   - "could not reach"- a network or timeout problem. A temporary condition, not a statement about the data;
//   - "service error"  - the service failed while working. The check did not complete, so there is no result.
// Collapsing any of these into "verification failed" would let a reader mistake an outage for evidence.

export const FAILURE_KINDS = {
  not_published: "not_published",
  withdrawn: "withdrawn",
  not_permitted: "not_permitted",
  needs_sign_in: "needs_sign_in",
  rate_limited: "rate_limited",
  unreachable: "unreachable",
  service_error: "service_error",
  not_configured: "not_configured",
  rejected: "rejected",
};

export const FAILURE_LABEL = {
  not_published: "Not published",
  withdrawn: "Withdrawn",
  not_permitted: "Not permitted",
  needs_sign_in: "Sign-in required",
  rate_limited: "Too many requests",
  unreachable: "Could not reach the service",
  service_error: "Service failed",
  not_configured: "Not configured here",
  rejected: "Refused by the service",
};

// Wording a reader can act on. `subject` names the thing that was being read, so the sentence never implies
// that a missing record is a missing figure.
const SENTENCE = {
  not_published: (what) => `No ${what} is published at this address, so nothing was checked against it. This is a missing reference, not a failed check.`,
  withdrawn: (what) => `The ${what} was superseded or revoked and is deliberately unavailable. Do not read it again as if it were released.`,
  not_permitted: (what) => `The ${what} exists but this account is not permitted to read it. Nothing about its contents is proven either way.`,
  needs_sign_in: (what) => `Reading the ${what} needs a signed-in session with the right role. No conclusion can be drawn from this attempt.`,
  rate_limited: (what) => `The service asked for fewer requests, so the ${what} was not read this time. Try again later.`,
  unreachable: (what) => `The service could not be reached while reading the ${what}. The check did not run, so treat the figures as unverified rather than wrong.`,
  service_error: (what) => `The service failed while producing the ${what}. The check did not complete, so there is no result to report.`,
  not_configured: (what) => `This build has no investigation service attached, so the ${what} cannot be read here at all.`,
  rejected: (what) => `The service refused the request for the ${what}.`,
};

const isNetwork = (error) => error?.name === "TypeError" || error?.name === "AbortError" || error?.code === "ERR_NETWORK";

// A message that comes from this app before any call was made (no HTTP status attached) is a local state,
// never evidence about the data.
const LOCAL_MARKERS = [/not configured/i, /is not set/i, /no governed api/i, /this build has no/i, /needs the configured local worker/i, /start the configured/i];
const SIGN_IN_MARKERS = [/sign in/i, /signed in/i, /session/i];

export function describeApiFailure(error, what = "record") {
  const status = Number(error?.status);
  const message = String(error?.message || "");
  let kind;
  if (Object.values(FAILURE_KINDS).includes(error?.kind)) kind = error.kind;
  else if (isNetwork(error) || status === 0) kind = FAILURE_KINDS.unreachable;
  else if (Number.isFinite(status)) {
    if (status === 404) kind = FAILURE_KINDS.not_published;
    else if (status === 410) kind = FAILURE_KINDS.withdrawn;
    else if (status === 401) kind = FAILURE_KINDS.needs_sign_in;
    else if (status === 403) kind = FAILURE_KINDS.not_permitted;
    else if (status === 429) kind = FAILURE_KINDS.rate_limited;
    else if (status >= 500) kind = FAILURE_KINDS.service_error;
    else kind = FAILURE_KINDS.rejected;
  } else if (LOCAL_MARKERS.some((pattern) => pattern.test(message))) kind = FAILURE_KINDS.not_configured;
  else if (SIGN_IN_MARKERS.some((pattern) => pattern.test(message))) kind = FAILURE_KINDS.needs_sign_in;
  else if (!message) kind = FAILURE_KINDS.unreachable;
  else kind = FAILURE_KINDS.rejected;

  return { kind, label: FAILURE_LABEL[kind], status: Number.isFinite(status) ? status : null, what, sentence: SENTENCE[kind](what) };
}

// The sentence a notice should show: the honest classification first, then whatever the service itself said.
// The service message is kept because it carries detail this file cannot know - which table was missing, what
// the release gate refused, or which environment variable a developer still has to set.
export function failureNotice(error, what = "record") {
  const failure = describeApiFailure(error, what);
  const detail = String(error?.message || "").trim();
  const showDetail = Boolean(detail) && !failure.sentence.includes(detail);
  const trace = error?.traceId && !detail.includes(String(error.traceId)) ? ` Trace ID: ${error.traceId}.` : "";
  return { ...failure, text: showDetail ? `${failure.sentence} The service said: ${detail}.${trace}` : `${failure.sentence}${trace}` };
}

// Several sections can fail at once for several different reasons. Naming them together as "some sections
// failed" would hide the one distinction that changes what a reader does next, so each reason present in the
// batch is listed under its own kind.
const SHORT = {
  not_published: "nothing is published at that address, so nothing was checked",
  withdrawn: "it has been superseded or revoked",
  not_permitted: "this account is not allowed to read it",
  needs_sign_in: "a session with the right role is required",
  rate_limited: "the service asked for fewer requests",
  unreachable: "the service could not be reached",
  service_error: "the service failed while working on it",
  not_configured: "this build has no service attached",
  rejected: "the service refused the request",
};

export function describeFailures(errors, what = "record") {
  const byKind = new Map();
  for (const error of errors) {
    const kind = describeApiFailure(error, what).kind;
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }
  return [...byKind].map(([kind, count]) => `${FAILURE_LABEL[kind]}: ${SHORT[kind]}${count > 1 ? ` (${count} sections)` : ""}.`).join(" ");
}
