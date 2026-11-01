// UPG-05: EICV7 survey estimates versus VUP administrative totals.
//
// Why this file exists: an estimated participation rate and an administrative beneficiary count are not
// the same measurement, and the difference between them is not evidence of fraud, leakage or exclusion.
// The difference can come from the population (persons vs households), the reporting period, the programme
// subset, the survey's own error, duplicate participation across support components, or the administrative
// frame. This module states which of those apply and refuses to do arithmetic the definitions do not allow.
//
// Design rules, all of them tested in `participationReconciliation.test.mjs`:
//   1. A comparison is `comparable` only through a mapping a named reviewer has signed. No signature exists
//      in this repository, so nothing here can reach that verdict — the same rule the governed engine applies
//      in `engine/ireme/semantics.py` ("empty means not approved").
//   2. Different units, universes or periods produce a reason, never a difference. Subtracting a share of
//      people from a share of poor households is the failure this contract exists to prevent.
//   3. A missing administrative reference is `unresolved`, not zero, not "verified", and not a finding.
//   4. Overlapping support components are memberships, not households. Their sum is an upper bound.
//   5. A sensitivity range is illustration under stated assumptions, and it is refused without them.
//   6. Nothing in the output may claim a cause.
//   7. "Available coverage" is counted from the rows handed in, never estimated: how much of the survey side
//      carries a design record, and how many administrative references are actually in this build.

import { coverage as designCoverage } from "./districtUncertainty.js";

export const CONTRACT_VERSION = "participation-reconciliation/v1";

// The reader-facing verdicts. Four different "we cannot compare" states are kept apart on purpose: a
// missing reference, a permission failure, a definitional mismatch and a period mismatch imply different
// next actions, and folding them together would tell a reader more than the evidence does.
export const VERDICT = {
  COMPARABLE: "comparable",
  NOT_COMPARABLE: "not_comparable",
  OUT_OF_PERIOD: "out_of_period",
  UNRESOLVED: "unresolved",
  NOT_PERMITTED: "not_permitted",
  NOT_ESTIMATED: "not_estimated",
  UNAPPROVED: "unapproved_mapping",
};

export const VERDICT_LABELS = {
  [VERDICT.COMPARABLE]: { label: "Comparable", note: "A reviewed mapping says these two measure the same thing." },
  [VERDICT.NOT_COMPARABLE]: { label: "Not comparable", note: "The definitions differ, so no difference is calculated." },
  [VERDICT.OUT_OF_PERIOD]: { label: "Different period", note: "The two figures describe different time frames." },
  [VERDICT.UNRESOLVED]: { label: "Unresolved", note: "One side of the comparison is not available here." },
  [VERDICT.NOT_PERMITTED]: { label: "Not permitted", note: "The reference exists but this session may not read it." },
  [VERDICT.NOT_ESTIMATED]: { label: "Not estimated", note: "The survey design does not support this figure." },
  [VERDICT.UNAPPROVED]: { label: "Mapping not signed off", note: "Both figures are in hand and agree on unit and period; a named reviewer still has to approve that they measure the same thing." },
};

export const UNITS = {
  PERSON_SHARE: "share of people",
  HOUSEHOLD_SHARE: "share of households",
  POOR_HOUSEHOLD_SHARE: "share of surveyed poor households",
  REGISTERED_HOUSEHOLDS: "registered households",
  REGISTERED_PERSONS: "registered persons",
  RECORD_COUNT: "records held on this platform",
};

// One-to-many: the survey cross-tabulation reports VUP support by component, the administrative register
// records enrolment by programme subtype, and the two do not line up one for one. A household can appear in
// more than one component, so the components below are marked for overlap instead of being added together.
export const VUP_COMPONENTS = [
  {
    id: "direct_support",
    surveyLabel: "Direct support",
    adminTypes: ["VUP Direct Support"],
    overlapsWith: ["public_works_classic", "public_works_expanded", "financial_services"],
    mappingState: "proposed_unsigned",
    note: "The same household can also be enrolled in a public works component in the same year.",
  },
  {
    id: "public_works_classic",
    surveyLabel: "Classic public works",
    adminTypes: [],
    overlapsWith: ["direct_support", "public_works_expanded"],
    mappingState: "unmapped_admin_side",
    note: "The survey reports this component; no administrative subtype in this build carries that name, so nothing on the register side is claimed for it.",
  },
  {
    id: "public_works_expanded",
    surveyLabel: "Expanded public works",
    adminTypes: ["Expanded Public Works"],
    overlapsWith: ["direct_support", "public_works_classic"],
    mappingState: "proposed_unsigned",
    note: "A proposed name match only. Whether the survey component and the administrative subtype cover the same works scheme is a reviewer decision.",
  },
  {
    id: "financial_services",
    surveyLabel: "Financial services",
    adminTypes: [],
    overlapsWith: ["direct_support"],
    mappingState: "unmapped_admin_side",
    note: "Savings and credit linkage is a survey category; it is not an enrolment subtype, so it cannot be reconciled against an enrolment count.",
  },
];

// Administrative programmes present in this application that the survey components above do not cover.
// Listed so the reader can see the gap rather than infer that the programme list is the survey breakdown.
export const UNMAPPED_ADMIN_PROGRAMMES = [
  { name: "Girinka Munyarwanda", reason: "A separate livestock-transfer programme, not a VUP support component." },
  { name: "Nsymibondo y'Icyaro", reason: "A bridging grant; the EICV7 component cross-tabulation does not report it separately." },
];

const has = (value) => value !== undefined && value !== null && String(value).trim() !== "";
const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);

// The survey side, normalised from the published aggregate row plus its design-based evidence record.
// Field names follow `src/data/dashboard-eicv7-uncertainty.json`, which is the only place in the frontend
// that carries sample observations, PSU counts and design degrees of freedom.
//
// The evidence record is looked up by estimand, because the artifact only holds design variance for the
// measures the estimator was run over: person-level poverty and extreme poverty per district, VUP
// participation among surveyed poor households per district, and the national poverty point. Where the
// artifact holds nothing for an estimand, `evidenceNote` says so in words instead of leaving a reader to
// read an empty interval as "no uncertainty".
const EVIDENCE_KEY = {
  vupAmongPoor: "vupEvidence",
  vupAmongAllHouseholds: "vupAllEvidence",
  poverty: "povertyEvidence",
  extremePoverty: "extremeEvidence",
};

export function surveySide({ row, measure, period, source }) {
  const evidenceKey = EVIDENCE_KEY[measure] ?? null;
  const evidence = evidenceKey ? (row?.[evidenceKey] ?? null) : null;
  const estimate = finiteNumber(row?.[measure]) ? row[measure] : null;
  const interval = evidence?.ciEstimated === true && finiteNumber(evidence.ciLow) && finiteNumber(evidence.ciHigh)
    ? { low: evidence.ciLow, high: evidence.ciHigh, method: evidence.ciMethod ?? null }
    : null;
  const unit = measure === "vupAmongPoor"
    ? UNITS.POOR_HOUSEHOLD_SHARE
    : measure === "vupAmongAllHouseholds"
      ? UNITS.HOUSEHOLD_SHARE
      : UNITS.PERSON_SHARE;
  return {
    side: "survey",
    estimand: measure,
    definition: evidence?.definition ?? null,
    unit,
    designUnit: evidence?.unit ?? null,
    estimate,
    standardError: finiteNumber(evidence?.se) ? evidence.se : null,
    interval,
    sample: { observations: evidence?.sampleObservations ?? null, psus: evidence?.samplePsus ?? null },
    designDegreesOfFreedom: finiteNumber(evidence?.df) ? evidence.df : null,
    reliability: evidence?.reliability ?? null,
    publishable: evidence?.publishable ?? null,
    period: period ?? null,
    source: source ?? null,
    evidenceNote: evidence
      ? null
      : estimate === null
        ? "This build holds neither the estimate nor its design record for that measure."
        : `The estimate is published, but the design artifact in this build carries no variance record for ${measure}, so no standard error or interval is shown beside it. The figure is not uncertainty-free: its uncertainty is simply not calculated here.`,
  };
}

// The administrative side. Absence is a state with a name, a reason and an actor: it is not a zero, and it
// is never reported as a completed check.
//
// A usable reference needs all of: the record definition (what one row means), the unit it counts in
// (persons or households), the reporting period, the enrolment status it includes, the last-updated date,
// the count and the source table. Anything missing keeps the row `unresolved` and names the gap.
export function administrativeSide(reference) {
  if (!reference || typeof reference !== "object") {
    return {
      side: "administrative",
      state: "not_available",
      present: false,
      definition: null,
      unit: null,
      count: null,
      period: null,
      status: null,
      lastUpdated: null,
      sourceTable: null,
      permitted: null,
      reason: "No authorised administrative beneficiary reference is present in this build. The repository holds NISR survey outputs and this platform's own programme records; it does not hold a MINALOC VUP register extract.",
      requiredActor: "VUP secretariat (MINALOC) statistics owner, to supply an authorised register definition, period and count with its source table.",
    };
  }
  const missing = [];
  if (!has(reference.definition)) missing.push("record definition");
  if (!has(reference.unit)) missing.push("counted unit (persons or households)");
  if (!has(reference.period)) missing.push("reporting period");
  if (!has(reference.status)) missing.push("included enrolment status");
  if (!has(reference.lastUpdated)) missing.push("last-updated date");
  if (!finiteNumber(reference.count)) missing.push("count");
  if (!has(reference.sourceTable)) missing.push("source table");
  const state = reference.permitted === false ? "not_permitted" : missing.length ? "incomplete" : "present";

  // Fail closed on a refusal. If the caller says this session may not read the register, nothing that
  // arrived alongside that flag is carried into the comparison: a permission check that leaves the payload
  // in the output has not checked anything.
  if (state === "not_permitted") {
    return {
      side: "administrative",
      state,
      present: false,
      permitted: false,
      definition: null,
      unit: null,
      count: null,
      period: null,
      status: null,
      lastUpdated: null,
      sourceTable: null,
      missingFields: [],
      withheldFromComparison: ["definition", "unit", "count", "period", "status", "last-updated", "source table"],
      reason: "The register exists but this account is not permitted to read it. Nothing about its contents is proven either way, and no difference is calculated from a refusal.",
      requiredActor: "Data owner: grant read access to this session, or publish the aggregate with its source table.",
    };
  }

  return {
    side: "administrative",
    state,
    present: true,
    permitted: reference.permitted === undefined ? null : Boolean(reference.permitted),
    definition: has(reference.definition) ? reference.definition : null,
    unit: has(reference.unit) ? reference.unit : null,
    count: finiteNumber(reference.count) ? reference.count : null,
    period: has(reference.period) ? reference.period : null,
    status: has(reference.status) ? reference.status : null,
    lastUpdated: has(reference.lastUpdated) ? reference.lastUpdated : null,
    sourceTable: has(reference.sourceTable) ? reference.sourceTable : null,
    missingFields: missing,
    reason: state === "incomplete"
      ? `The reference is present but incomplete: ${missing.join(", ")} missing. A comparison needs all seven.`
      : "The reference is complete and readable.",
    requiredActor: state === "incomplete"
      ? "Data owner: supply the missing fields above."
      : null,
  };
}

// A mapping row is only worth anything if a named reviewer signed it, exactly as the governed engine
// requires (`EquivalenceRegistry.add` refuses an entry without `approved_by` and a rationale).
export function mappingIsSigned(mapping) {
  if (!mapping || typeof mapping !== "object") return false;
  return has(mapping.approvedBy) && has(mapping.rationale) && mapping.verified === true;
}

const samePeriod = (a, b) => has(a) && has(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Comparability is decided from the measurement basis, never from whether two labels happen to be equal.
// Three separate questions must agree before a subtraction between the two sides means anything: who is
// counted (persons or households), what is counted (a share of a population or a count of records), and
// when (the time frame the figure describes). Each question below answers one of them.
export function unitBasis(unit) {
  const text = String(unit || "").toLowerCase();
  if (/household/.test(text)) return "household";
  if (/(person|people|individual)s?\b/.test(text)) return "person";
  return "unstated";
}

export function unitKind(unit) {
  const text = String(unit || "").toLowerCase();
  if (/(share|rate|proportion|percent|%)/.test(text)) return "share";
  if (/(count|registered|records|enrol|household|person|people)/.test(text)) return "count";
  return "unstated";
}

// EICV7 labels its waves as fiscal years ("2023/24"); an administrative register often quotes a rolling
// twelve months or a calendar year. Two figures can be identical in name and still describe different
// months, which is a period problem, not a difference between places.
export function periodBasis(period) {
  const text = String(period || "").trim().toLowerCase();
  if (!text) return "unstated";
  if (/(rolling|last 12|twelve months|12[- ]month|12[- ]months)/.test(text)) return "rolling_12_months";
  if (/(fiscal|financial year)/.test(text) || /^\d{4}\/\d{2,4}$/.test(text) || /\b\d{4}\/\d{4}\b/.test(text)) return "fiscal_year";
  if (/calendar year/.test(text) || /^\d{4}$/.test(text)) return "calendar_year";
  return "unstated";
}

const PERIOD_BASIS_LABEL = {
  rolling_12_months: "a rolling twelve months",
  fiscal_year: "a fiscal year",
  calendar_year: "a calendar year",
  unstated: "an unstated time frame",
};

// The comparison itself. Returns a verdict, the precise reasons, and a difference only when the
// definitions genuinely allow one.
export function compareParticipation({ title, survey, admin, mapping, overlapNote }) {
  const reasons = [];
  const statements = [];

  if (admin?.state === "not_permitted") {
    reasons.push("administrative_reference_not_permitted");
    statements.push("The administrative register exists but this session cannot read it, so the survey figure stands alone and no gap is claimed.");
  }
  if (admin?.state === "not_available") {
    reasons.push("administrative_reference_unavailable");
    statements.push("No authorised administrative count is available here, so this row stays unresolved. An unresolved row is not evidence of a problem: it means the second number was never read.");
  }
  if (admin?.state === "incomplete") {
    reasons.push(`administrative_reference_incomplete:${(admin.missingFields ?? []).join("+")}`);
    statements.push(`The reference supplied is missing ${admin.missingFields.join(", ")}, so it cannot be paired with the survey estimate yet.`);
  }
  if (!mappingIsSigned(mapping)) {
    reasons.push("mapping_unsigned");
    statements.push("The survey-to-register mapping for this comparison is proposed, not signed: no named reviewer has approved that the two definitions measure the same thing.");
  }
  if (!finiteNumber(survey?.estimate)) {
    reasons.push("survey_estimate_missing");
    statements.push("The survey side carries no estimate for this domain, so the comparison reports that instead of substituting zero or a neighbouring district.");
  } else if (survey?.publishable === false) {
    reasons.push("survey_domain_below_publishable_floor");
    statements.push("The estimate exists but falls below the publication floor for this design, so it is not used for a comparison.");
  }

  // Who is counted. A share of people and a count of households are different populations, and subtracting
  // one from the other is the specific error this contract was written to stop.
  const surveyUnitBasis = unitBasis(survey?.unit);
  const adminUnitBasis = unitBasis(admin?.unit);
  if (has(admin?.unit) && has(survey?.unit) && surveyUnitBasis !== "unstated" && adminUnitBasis !== "unstated" && surveyUnitBasis !== adminUnitBasis) {
    reasons.push(`person_household_mismatch:survey is in ${surveyUnitBasis}, register is in ${adminUnitBasis}`);
    statements.push(`The survey figure counts ${surveyUnitBasis} and the register counts ${adminUnitBasis}. Rwanda households average more than one member, so the two numbers are not on the same scale and a gap between them says nothing about the programme.`);
  }

  // What is counted. A percentage of a population and a count of registered rows are not the same statistic
  // even for the same population; one of them needs a denominator the other side does not supply.
  const surveyUnitKind = unitKind(survey?.unit);
  const adminUnitKind = unitKind(admin?.unit);
  if (has(admin?.unit) && has(survey?.unit) && surveyUnitKind !== "unstated" && adminUnitKind !== "unstated" && surveyUnitKind !== adminUnitKind) {
    reasons.push(`share_vs_count_mismatch:survey ${surveyUnitKind}, register ${adminUnitKind}`);
    statements.push("One side is a share of a population and the other is a count of records. Turning a share into a count needs a household denominator that neither document in this build supplies, so no conversion is offered here.");
  }

  // When. Only checked once both sides actually state a period; a missing period is already an incomplete
  // reference and is reported as that rather than dressed up as a mismatch.
  if (admin?.state === "present" && has(survey?.period) && has(admin.period) && !samePeriod(survey.period, admin.period)) {
    const surveyPeriodBasis = periodBasis(survey.period);
    const adminPeriodBasis = periodBasis(admin.period);
    if (surveyPeriodBasis !== "unstated" && adminPeriodBasis !== "unstated" && surveyPeriodBasis !== adminPeriodBasis) {
      reasons.push(`period_mismatch:${survey.period} vs ${admin.period}`);
      statements.push(`The survey estimate covers ${PERIOD_BASIS_LABEL[surveyPeriodBasis]} (${survey.period}) and the register covers ${PERIOD_BASIS_LABEL[adminPeriodBasis]} (${admin.period}). Enrolment changes during a year, so the two windows cannot be differenced even where the definitions agree.`);
    } else if (surveyPeriodBasis === "unstated" || adminPeriodBasis === "unstated") {
      reasons.push(`period_basis_unstated:${survey.period} vs ${admin.period}`);
      statements.push("Both sides give a period but neither states whether it is a fiscal year, a calendar year or a rolling twelve months, so the comparison cannot confirm they describe the same months.");
    }
  }

  if (overlapNote) {
    reasons.push("components_overlap");
    statements.push(overlapNote);
  }

  const verdict = admin?.state === "not_permitted"
    ? VERDICT.NOT_PERMITTED
    : admin?.state === "not_available" || admin?.state === "incomplete"
      ? VERDICT.UNRESOLVED
      : !finiteNumber(survey?.estimate) || survey?.publishable === false
        ? VERDICT.NOT_ESTIMATED
        : reasons.some((item) => item.startsWith("period_mismatch"))
          ? VERDICT.OUT_OF_PERIOD
          : reasons.some((item) => item.startsWith("person_household_mismatch")
              || item.startsWith("share_vs_count_mismatch")
              || item === "components_overlap")
            ? VERDICT.NOT_COMPARABLE
            : mappingIsSigned(mapping) && reasons.length === 0
              ? VERDICT.COMPARABLE
              : reasons.includes("mapping_unsigned") || reasons.includes("period_basis_unstated")
                ? VERDICT.UNAPPROVED
                : VERDICT.UNRESOLVED;

  // Arithmetic is only performed for a signed, complete, same-unit, same-period comparison. Everything else
  // states why the subtraction would be meaningless.
  const difference = verdict === VERDICT.COMPARABLE && finiteNumber(admin.count) && finiteNumber(survey.estimate)
    ? {
        survey: survey.estimate,
        administrative: admin.count,
        gap: admin.count - survey.estimate,
        unit: survey.unit,
        note: "Both sides count the same unit over the same period under a signed mapping, so this gap is arithmetically meaningful. It is still the gap between an estimate and a register, not proof about the programme: survey error, enrolment timing and the administrative frame all remain in play.",
      }
    : null;

  return {
    title,
    contract: CONTRACT_VERSION,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict].label,
    verdictNote: VERDICT_LABELS[verdict].note,
    reasons,
    statements,
    survey: survey ?? null,
    administrative: admin ?? null,
    mapping: mapping ? { ...mapping, signed: mappingIsSigned(mapping) } : null,
    difference,
    interpretationLimit: "A difference between an estimated participation rate and an administrative count is not evidence of fraud, ghost beneficiaries or exclusion. It is first a question of definitions, periods, frames and survey error.",
  };
}

// Memberships are not households. Returns the sum only as an explicitly labelled upper bound.
export function componentMemberships(components = VUP_COMPONENTS, values = {}) {
  const listed = components.map((component) => ({
    id: component.id,
    surveyLabel: component.surveyLabel,
    value: finiteNumber(values[component.id]) ? values[component.id] : null,
    // Which administrative programmes a *reviewer* proposes to pair this component with. Empty means the
    // register side has no counterpart in this build; it never means "zero enrolled".
    administrativeProgrammes: [...(component.adminTypes ?? [])],
    overlapsWith: component.overlapsWith,
    mappingState: component.mappingState,
    note: component.note,
  }));
  const total = listed.reduce((sum, item) => sum + (item.value ?? 0), 0);
  const anyOverlap = components.some((component) => (component.overlapsWith ?? []).length > 0);
  return {
    components: listed,
    total,
    // Disjoint sets add; overlapping sets do not. Nothing here can claim disjointness, so the total is a bound.
    additive: !anyOverlap,
    asUpperBoundOfMemberships: anyOverlap ? total : null,
    note: anyOverlap
      ? "These components overlap, so the total counts memberships, not households: a household in two components appears twice. The sum is an upper bound on households and must not be read as one."
      : "The components are declared disjoint, so the total is a count of households.",
  };
}

// A sensitivity range is illustration, and illustration without assumptions is invention. Refused unless
// every assumption is stated, and the result is permanently marked as not an observation.
export function sensitivityBand({ low, high, assumptions = [], basis }) {
  const stated = assumptions.filter(has);
  if (!finiteNumber(low) || !finiteNumber(high) || low > high || stated.length === 0 || !has(basis)) {
    return {
      available: false,
      illustrative: false,
      reason: "A sensitivity range needs an explicit, stated assumption about what could be wrong — incomplete registration, duplicate enrolment, a period offset. Without one it would be a invented number dressed as analysis, so none is shown.",
    };
  }
  return {
    available: true,
    illustrative: true,
    low,
    high,
    basis,
    assumptions: stated,
    note: "Illustration only: this range shows what the stated assumptions would imply. It is not an observation, not a measurement, and not evidence that the situation it describes is the real one.",
  };
}

// Available coverage, counted rather than claimed. UPG-05 asks the contract to state it, and the only honest
// way to state it is to count the rows the application actually renders: how many districts carry a design
// interval and a contrast, and how many administrative references exist in this build. A reference is counted
// only when it arrived as an object, because an absent one is not a coverage figure of zero — it is the
// reason every row stays unresolved.
export function evidenceCoverage({ districtRows = [], nationalRow = null, adminReferences = [] }) {
  const rows = (Array.isArray(districtRows) ? districtRows : []).filter(Boolean);
  const design = designCoverage(rows);
  const references = (Array.isArray(adminReferences) ? adminReferences : []).filter((item) => item && typeof item === "object").length;
  const nationalHasInterval = Boolean(nationalRow?.povertyInterval);
  return {
    surveyGeographies: design.total,
    surveyGeographiesWithInterval: design.withInterval,
    surveyGeographiesWithContrast: design.withContrast,
    nationalHasInterval,
    administrativeReferences: references,
    // With no reference at all the count is a fact of this build. With one in hand, how many geographies are
    // reconcilable depends on a signed mapping per indicator, which is a reviewer decision, so it stays
    // uncounted rather than being guessed at.
    reconcilableGeographies: references === 0 ? 0 : null,
    statement: references === 0
      ? `${design.withInterval} of ${design.total} districts carry a design interval for poverty, and the national figure ${nationalHasInterval ? "does too" : "does not"}. Zero authorised administrative references are present in this build, so zero geographies can be reconciled: the survey side is measurable on its own and unpairable against a register.`
      : `${design.withInterval} of ${design.total} districts carry a design interval, and ${references} administrative reference${references === 1 ? "" : "s"} is in hand. Each pairing still needs a signed mapping before it counts as reconciled.`,
  };
}

// The panel's rows, built from live data structures rather than written-out numbers.
// Nothing here invents an administrative total. With no authorised register in the build, rows 1 and 2 are
// `unresolved` by construction, and row 3 exists so a reader cannot quietly treat this platform's own
// demonstration records as if they were a beneficiary register.
export function buildReconciliation({ national, district, period, source, adminReference, mappings = {}, membershipValues, districtRows = [] }) {
  const rows = [];

  rows.push(compareParticipation({
    title: "Estimated coverage of all households versus registered households",
    survey: surveySide({ row: national, measure: "vupAmongAllHouseholds", period, source }),
    admin: administrativeSide(adminReference),
    mapping: mappings.householdCoverage ?? {
      indicator: "VUP coverage of all households",
      // The national artifact publishes 11.6 percent of households; the register would count households.
      // Same counted unit, different statistic kind, and no reviewer has signed the pairing.
      approvedBy: null,
      rationale: null,
      verified: false,
    },
  }));

  rows.push(compareParticipation({
    title: "VUP participation among surveyed poor households versus a register count",
    survey: surveySide({ row: district ?? national, measure: "vupAmongPoor", period, source }),
    admin: administrativeSide(adminReference),
    mapping: mappings.vupAmongPoor ?? {
      indicator: "VUP participation, poor households",
      // The survey denominator is surveyed poor households; a register count is registered households. Even
      // with a count in hand these are different universes, which is why this row can never reach comparable.
      definitionNote: "Different universes: poor households surveyed, versus every registered beneficiary household.",
      approvedBy: null,
      rationale: null,
      verified: false,
    },
    overlapNote: "This share is calculated on surveyed poor households. A register count is not restricted to poor households, and the two are not the same group.",
  }));

  rows.push({
    title: "This platform's programme records versus the survey estimate",
    contract: CONTRACT_VERSION,
    verdict: VERDICT.NOT_COMPARABLE,
    verdictLabel: VERDICT_LABELS[VERDICT.NOT_COMPARABLE].label,
    verdictNote: VERDICT_LABELS[VERDICT.NOT_COMPARABLE].note,
    reasons: ["demonstration_records", "different_frame"],
    statements: [
      "The member, payment and agent records this platform holds are demonstration records: not a beneficiary register, and not survey estimates. They exist to show the workflow.",
      "Converting them into a coverage or finance figure would be exactly the mistake this panel exists to prevent, so no such conversion is offered.",
    ],
    memberships: componentMemberships(VUP_COMPONENTS, membershipValues),
    interpretationLimit: "A demonstration record is not an observation about Rwanda's programme. Nothing here turns one into the other.",
  });

  return {
    contract: CONTRACT_VERSION,
    period: period ?? null,
    source: source ?? null,
    rows,
    coverage: evidenceCoverage({
      districtRows,
      nationalRow: national,
      adminReferences: adminReference ? [adminReference] : [],
    }),
  };
}

// Where every number in a reconciliation document came from. Recorded in the export because a reviewer
// asking "which run produced this?" should be able to answer it without reading the code.
export const DATA_LINEAGE = [
  {
    role: "survey point estimates",
    artifact: "src/data/dashboard-eicv7-aggregates.json",
    supplies: "National and district poverty, extreme-poverty and VUP participation percentages, with sample counts.",
    producedBy: "tools/analysis derived from the EICV7 published tables; joins to the app through src/data/dashboardEvidence.js.",
  },
  {
    role: "design-based uncertainty",
    artifact: "src/data/dashboard-eicv7-uncertainty.json",
    supplies: "Standard errors, intervals, design degrees of freedom, sample observations, PSU counts, design effect, CV, reliability and publishable flags.",
    producedBy: "tools/analysis/derive_dashboard_uncertainty.py running engine/ireme/survey.py over the licensed microdata. The microdata itself is not in this repository and is never exported.",
  },
  {
    role: "uncertainty attach rule",
    artifact: "src/lib/districtUncertainty.js",
    supplies: "The fail-closed rule: an interval is attached only when the derived point still matches the displayed figure within POINT_TOLERANCE_PP.",
  },
  {
    role: "official source references",
    artifact: "src/data/dashboardEvidence.js (DASHBOARD_SOURCES)",
    supplies: "The NISR EICV7 main-indicator and poverty-profile documents and the FinScope microdata catalogue entry.",
  },
  {
    role: "equivalence signature rule",
    artifact: "engine/ireme/semantics.py",
    supplies: "The governed engine's rule that an official-versus-computed equivalence needs a named reviewer and a rationale. This module applies the same rule to the mapping table.",
  },
  {
    role: "administrative reference",
    artifact: "not present in this build",
    supplies: "Nothing. No authorised MINALOC/VUP register extract exists here, which is why the register side is unresolved rather than zero.",
  },
];

const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const row = (cells) => cells.map(csvCell).join(",");
const notStated = (value) => (value === null || value === undefined || value === "" ? "not stated" : value);
const intervalText = (interval) => (interval ? `${interval.low} to ${interval.high}` : "not calculated");

// The reproducible export. One CSV text with five labelled sections: contract, mapping table, the
// reconciliation rows with their uncertainty, limitations, and data lineage. Written as sections rather than
// one flat table because the mapping rows and the verdict rows have different columns, and a reviewer needs
// to see that they are different objects.
export function reconciliationToCsv(document) {
  const lines = [];

  lines.push(row(["# UPG-05 survey versus administrative reconciliation"]));
  lines.push(row(["contract", document.contract]));
  lines.push(row(["period", notStated(document.period)]));
  lines.push(row(["survey source", notStated(document.source)]));
  lines.push(row(["generated from", "src/lib/participationReconciliation.js buildReconciliation()"]));
  lines.push(row(["available coverage", document.coverage ? document.coverage.statement : "not stated"]));
  lines.push(row([]));

  lines.push(row(["# 1. Mapping table (signed off by a named reviewer or it is not a comparison)"]));
  lines.push(row(["indicator", "survey_unit", "administrative_definition", "approved_by", "rationale", "verified", "signed", "definition_note"]));
  for (const item of document.rows) {
    if (!item.mapping) continue;
    lines.push(row([
      item.title,
      notStated(item.survey?.unit),
      notStated(item.administrative?.definition),
      notStated(item.mapping.approvedBy),
      notStated(item.mapping.rationale),
      String(item.mapping.verified === true),
      String(item.mapping.signed === true),
      notStated(item.mapping.definitionNote),
    ]));
  }
  lines.push(row([]));

  lines.push(row(["# 2. Reconciliation rows with their uncertainty"]));
  lines.push(row(["comparison", "verdict", "reasons", "survey_unit", "survey_estimate", "survey_se", "survey_interval_95", "sample_observations", "sample_psus", "design_df", "reliability", "publishable", "administrative_state", "administrative_count", "administrative_period", "administrative_source_table", "gap", "limitation"]));
  for (const item of document.rows) {
    lines.push(row([
      item.title,
      item.verdict,
      (item.reasons ?? []).join("; "),
      notStated(item.survey?.unit),
      item.survey?.estimate ?? "no estimate",
      item.survey?.standardError ?? "not calculated",
      intervalText(item.survey?.interval),
      item.survey?.sample?.observations ?? "not stated",
      item.survey?.sample?.psus ?? "not stated",
      item.survey?.designDegreesOfFreedom ?? "not stated",
      notStated(item.survey?.reliability),
      item.survey?.publishable === null || item.survey?.publishable === undefined ? "not assessed" : String(item.survey.publishable),
      notStated(item.administrative?.state),
      item.administrative?.count ?? "not available",
      notStated(item.administrative?.period),
      notStated(item.administrative?.sourceTable),
      item.difference ? item.difference.gap : "not calculated: definitions do not allow a difference",
      item.interpretationLimit,
    ]));
  }
  lines.push(row([]));

  lines.push(row(["# 3. Stated limitations"]));
  for (const item of document.rows) {
    for (const statement of item.statements ?? []) lines.push(row([item.title, statement]));
  }
  lines.push(row(["All rows", "A difference between an estimated participation rate and an administrative count is not evidence of fraud, ghost beneficiaries or exclusion."]));
  lines.push(row([]));

  lines.push(row(["# 4. Data lineage"]));
  lines.push(row(["role", "artifact", "supplies", "produced_by"]));
  for (const entry of DATA_LINEAGE) {
    lines.push(row([entry.role, entry.artifact, entry.supplies, entry.producedBy ?? "not applicable"]));
  }
  lines.push(row([]));

  // QA-05-02 has to survive the export. A reader who only opens the CSV still needs to see that the
  // component figures are memberships over overlapping sets, and which components have no administrative
  // counterpart at all — otherwise the total invites exactly the double count this section forbids.
  lines.push(row(["# 5. Programme components behind the rows above (memberships, not households)"]));
  lines.push(row(["comparison", "component", "administrative_programmes", "overlaps_with_other_components", "mapping_state", "share", "note"]));
  for (const item of document.rows) {
    const memberships = item.memberships;
    if (!memberships) continue;
    for (const component of memberships.components) {
      lines.push(row([
        item.title,
        component.surveyLabel ?? component.id,
        component.administrativeProgrammes?.length ? component.administrativeProgrammes.join(" + ") : "none in this build",
        component.overlapsWith?.length ? component.overlapsWith.join(", ") : "declared disjoint",
        notStated(component.mappingState),
        component.value ?? "not stated",
        notStated(component.note),
      ]));
    }
    lines.push(row([
      item.title,
      "total",
      "",
      memberships.additive ? "no overlap declared" : "overlap declared on at least one component",
      String(memberships.additive),
      memberships.total,
      memberships.note,
    ]));
  }

  return lines.map((line) => line ?? "").join("\r\n");
}
