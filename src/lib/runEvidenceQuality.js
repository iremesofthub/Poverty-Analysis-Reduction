import { featureById } from "./judgeFeatureRegistry.js";

// Evidence quality of a governed research run, derived only from what the run record actually carries.
//
// The engine writes this record itself (engine/ireme/science.py) and nothing in it is chosen by the browser:
// the workflow state, the scientific decision and its reasons, the certified-fact list, the per-stage hashes
// and the point-by-point differences between the Python estimator and the independent R reference. This module
// reads those and says, in separate sentences, what a reader may and may not conclude.
//
// Four rules hold throughout:
//   1. a run with no record produces no counts at all - an empty panel is not a clean panel;
//   2. "failed", "not attempted", "cannot be compared" and "not externally verified" stay four different facts;
//   3. the independent recomputation here is Python-against-R on the same archive. It is not a comparison with
//      an NISR publication, and it is never described as one;
//   4. no human approval is inferred. The engine's own reasons say the review is outstanding, so the panel says so.

const STAGE_DONE = "done";
const STAGE_FAILED = "failed";

const RELEASE_LABEL = {
  restricted_draft: "Restricted draft",
  awaiting_review: "Awaiting review",
  approved: "Reviewer-approved",
  published: "Published",
  superseded: "Superseded",
  revoked: "Revoked",
  qa_failed: "Quality checks failed",
  queued: "Queued, not yet executed",
  running: "Running",
  complete: "Worker finished",
  failed: "Worker failed",
};

const DECISION_LABEL = {
  methodology_review_required: "Independent scientific review is outstanding",
  independently_validated: "Independently validated by a second statistician",
};

// The R reference uses a different interval construction; the difference is a method fact, not an error.
const CI_METHOD_LABEL = {
  t_design: "design-based t interval",
  normal: "normal approximation",
  korn_graubard_logit: "Korn-Graubard logit interval",
};

const nonEmptyString = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const numbers = (values) => values.map(Number).filter((value) => Number.isFinite(value));
const FULL_HASH = (value) => (/^[a-f0-9]{64}$/i.test(value || "") ? value.toLowerCase() : null);

export function runEvidenceQuality(investigation) {
  // A response object with no run content at all is the same case as no response: there is nothing to report.
  const hasRunContent = Boolean(investigation?.status || investigation?.manifest || investigation?.scientific_decision
    || Array.isArray(investigation?.differences) || Array.isArray(investigation?.certified_fact_ids));
  if (!investigation || typeof investigation !== "object" || !hasRunContent) {
    return {
      available: false,
      reason: "No run record is loaded, so this view states nothing about evidence quality. An absent check is not a passed check.",
      releaseState: null, decision: null, certified: null, stages: null, integrity: null,
      recomputation: null, publishedComparison: null, model: null, approvals: null, sample: null,
    };
  }

  const manifest = investigation.manifest || {};
  const status = nonEmptyString(investigation.status);
  const decisionToken = nonEmptyString(investigation.scientific_decision);
  const reasons = Array.isArray(investigation.reasons) ? investigation.reasons.filter(Boolean) : [];
  const certifiedIds = Array.isArray(investigation.certified_fact_ids) ? investigation.certified_fact_ids : [];

  const stageRows = Array.isArray(manifest.stages) ? manifest.stages : [];
  const stagesNamed = stageRows.filter((item) => nonEmptyString(item?.stage_id));
  const stageStatus = (item) => nonEmptyString(item?.status) || "not recorded";
  const completed = stagesNamed.filter((item) => item.status === STAGE_DONE);
  const failed = stagesNamed.filter((item) => item.status === STAGE_FAILED);
  const otherStages = stagesNamed.filter((item) => item.status !== STAGE_DONE && item.status !== STAGE_FAILED);
  // A stage marked done with no output hash cannot be re-derived, so the chain has a gap even though the
  // status looks clean. Missing evidence is reported as missing, not folded into the passing count.
  const withoutOutputHash = completed.filter((item) => !nonEmptyString(item.output_sha256));
  const done = completed.filter((item) => nonEmptyString(item.output_sha256));

  const differences = Array.isArray(investigation.differences) ? investigation.differences : [];
  const geographies = [...new Set(differences.map((item) => item?.geography).filter(Boolean))];
  const quantities = [...new Set(differences.map((item) => item?.quantity).filter(Boolean))];
  const ciMethodPairs = [...new Map(differences
    .filter((item) => item?.ci_methods?.python || item?.ci_methods?.r)
    .map((item) => [`${item.ci_methods.python}|${item.ci_methods.r}`, { python: item.ci_methods.python, r: item.ci_methods.r }])).values()];
  const pointDifferences = numbers(differences.map((item) => item?.point_difference));
  const seDifferences = numbers(differences.map((item) => item?.se_difference));

  const model = featureById("model-evaluation");
  const workflowVersion = nonEmptyString(manifest.workflow_version);
  const integrityFields = {
    datasetSha256: nonEmptyString(manifest.data_snapshot_sha256),
    codeCommit: nonEmptyString(manifest.code_commit),
    environmentSha256: nonEmptyString(manifest.science_environment_sha256),
    indicatorRegistrySha256: nonEmptyString(manifest.indicator_registry_sha256),
  };

  return {
    available: true,
    run: { id: nonEmptyString(manifest.investigation_id) || null, district: nonEmptyString(investigation.district) || null, created: nonEmptyString(manifest.created_at) },
    releaseState: {
      token: status,
      label: status ? (RELEASE_LABEL[status] || `Unrecognised state "${status}"`) : "No state recorded",
      // The engine's own release vocabulary is the only thing that can make a report "published". Nothing in a
      // browser view can grant it, and this panel does not pretend otherwise.
      note: status === "published"
        ? "Released by the governed API under a recorded approval."
        : `${RELEASE_LABEL[status] || status || "No state"} here. Only the governed API's release gate can mark a report published, and this record does not do that.`,
    },
    decision: {
      token: decisionToken,
      label: decisionToken ? (DECISION_LABEL[decisionToken] || `Unrecognised decision "${decisionToken}"`) : "No scientific decision recorded",
      outstanding: decisionToken !== "independently_validated",
      reasons,
      // Reasons the engine stopped short; they are unresolved approvals, not failures of the calculation.
      unresolved: reasons.length,
    },
    certified: {
      count: certifiedIds.length,
      ids: certifiedIds,
      note: certifiedIds.length
        ? `${certifiedIds.length} fact id${certifiedIds.length === 1 ? "" : "s"} the engine marks as certified.`
        : "No figure in this run is certified by the science gate, so none may be quoted as an official result.",
    },
    stages: {
      total: stagesNamed.length,
      done: done.length,
      failed: failed.map((item) => item.stage_id),
      other: otherStages.map((item) => ({ stage: item.stage_id, status: stageStatus(item) })),
      missingOutputHash: withoutOutputHash.map((item) => item.stage_id),
      note: stagesNamed.length === 0
        ? "The manifest lists no stages, so no part of this run is shown as checked."
        : `${done.length} of ${stagesNamed.length} recorded stages completed with a re-derivable output hash. Failed, unrecognised and unverifiable stages are listed separately and never counted as passed.`,
    },
    integrity: {
      ...integrityFields,
      workflowVersion,
      recorded: Object.values(integrityFields).filter(Boolean).length,
      total: Object.keys(integrityFields).length,
      // A short commit is enough to point at a checkout, but a full hash is what cannot be substituted.
      commitIsFullHash: /^[a-f0-9]{40}$/.test(integrityFields.codeCommit || ""),
    },
    // "Independently recomputed" in this product means the same archive estimated twice, in two languages, by two
    // implementations. It does not mean an NISR publication was matched.
    recomputation: differences.length === 0 && quantities.length === 0
      ? { attached: false, note: "This run carries no second-implementation comparison, so nothing was independently recomputed." }
      : {
        attached: true,
        geographies, quantities,
        compared: differences.length,
        maxPointDifference: pointDifferences.length ? Math.max(...pointDifferences.map(Math.abs)) : null,
        maxSeDifference: seDifferences.length ? Math.max(...seDifferences.map(Math.abs)) : null,
        ciMethods: ciMethodPairs.map((pair) => `${CI_METHOD_LABEL[pair.python] || pair.python || "not stated"} against ${CI_METHOD_LABEL[pair.r] || pair.r || "not stated"}`),
        note: `${differences.length} value${differences.length === 1 ? "" : "s"} recomputed in R from the same authorized archive and compared against the Python estimator. Differences are reported for review; a difference within tolerance is still not a publication match.`,
      },
    publishedComparison: {
      attached: false,
      note: "No comparison with an NISR published table is attached to this run record. Published-figure verification is a separate check; when it runs, its registry is printed in the report's evidence section.",
    },
    sample: {
      recorded: false,
      note: "This run record carries no sample size or design-effect summary, so reliability bands for its figures are not stated here.",
    },
    model: {
      state: model?.state || "unrecorded",
      reviewOutstanding: Boolean(model?.reviewOutstanding),
      note: model?.state === "unavailable"
        ? "No trained or validated targeting model exists in this build: nothing here is not trained, not evaluated, and not a governed release. The AI roles propose text only."
        : `Model status recorded as "${model?.state}" by the feature registry.`,
    },
    approvals: {
      recorded: false,
      note: "No human reviewer approval is recorded in this run record. Passing checks are not sign-off.",
    },
  };
}

// The governed report endpoints answer with a small, specific payload: the review route returns
// {report_id, version, report_ast_sha256, status, decision:{status, reasons}} and the publish route returns
// {report_id, version, status}. Anything this function says about a report is read from those fields only.
// It exists because the release state of a report is exactly the thing a reader must not have to infer from a
// raw JSON dump or from the wording of a button they just pressed.
export function reportReleaseQuality(record) {
  const hasRecord = Boolean(record && typeof record === "object"
    && (record.status || record.report_id || record.report_ast_sha256 || record.decision));
  if (!hasRecord) {
    return {
      available: false,
      reason: "No report response has been read from the governed API in this session, so no release state is stated here. An absent record is not an approved report.",
      identity: null, releaseState: null, hash: null, decision: null,
      approvals: null, verification: null, bytes: null,
    };
  }

  const status = nonEmptyString(record.status);
  const hashValue = nonEmptyString(record.report_ast_sha256);
  const boundHash = FULL_HASH(hashValue);
  const decisionBody = record.decision && typeof record.decision === "object" ? record.decision : null;
  const reasons = Array.isArray(decisionBody?.reasons) ? decisionBody.reasons.filter(Boolean) : [];

  return {
    available: true,
    identity: {
      reportId: nonEmptyString(record.report_id),
      version: nonEmptyString(record.version),
    },
    releaseState: {
      token: status,
      label: status ? (RELEASE_LABEL[status] || `Unrecognised state "${status}"`) : "No state recorded",
      // `published` is granted only by the engine's release gate. The review or publish call returning 200
      // is the server's own record of the state it wrote, which is why the state is printed from the response.
      note: status === "published"
        ? "The governed API reports this version as published. That decision is recorded server-side against the reviewer and publisher signatures."
        : `${RELEASE_LABEL[status] || status || "No state"}: the governed API has not released this version, so it is not an official output and may not be quoted as one.`,
    },
    hash: {
      value: boundHash || hashValue,
      complete: Boolean(boundHash),
      note: boundHash
        ? "The review is bound to this frozen snapshot hash. If the report is re-rendered and the bytes change, the engine refuses the stale review with 409 REPORT_CHANGED."
        : (hashValue
          ? "The response carries a snapshot reference that is not a full 64-character SHA-256, so it cannot be checked against the stored AST."
          : "This response carries no reviewed snapshot hash, so nothing here proves which report bytes the decision applied to."),
    },
    decision: decisionBody
      ? {
        recorded: true,
        token: nonEmptyString(decisionBody.status),
        // The engine's decision object lists the reasons it stopped short of a full release. They stay visible.
        outstanding: reasons.length > 0,
        reasons,
        note: reasons.length
          ? `${reasons.length} reason${reasons.length === 1 ? "" : "s"} the engine attached to this decision.`
          : "The engine attached no outstanding reasons to this decision.",
      }
      : {
        recorded: false, token: null, outstanding: null, reasons: [],
        note: "This response carries no review decision object, so no approval or rejection is shown for it.",
      },
    approvals: {
      recorded: false,
      // The response deliberately names no reviewer, and the browser cannot sign anything on a human's behalf.
      note: "The response names no reviewer identity. Signatures are stored server-side, so this view cannot show who approved and never records an approval itself.",
    },
    verification: {
      attached: false,
      note: "No published-figure verification registry is attached to this response. That check belongs to the report's own evidence section, and its absence here is not a passed check.",
    },
    bytes: {
      note: "Report bytes are returned only by the server export route, which refuses drafts, superseded and revoked versions. Nothing in this view produces a downloadable report.",
    },
  };
}
