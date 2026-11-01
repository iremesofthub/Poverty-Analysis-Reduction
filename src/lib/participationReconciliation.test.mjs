// UPG-05 acceptance tests for the survey-versus-administrative reconciliation contract.
//
// The workstream's acceptance sheet names seven cases, and each one has a test below under the same name:
// source missing, duplication, person-household mismatch, 12-month vs fiscal-year mismatch,
// disjoint/non-disjoint programmes, permission failure, unavailable administrative reference. Alongside them
// are the rules the case list exists to protect: no difference is calculated without a signed mapping, no
// overlapping component is summed as households, no sentence claims a cause, and the export carries its own
// mapping table, uncertainty, limitations, lineage and component block.
//
// `03_TESTS/SCENARIO_MATRIX.md` asks for QA-05-01 (household-versus-person counts flagged non-comparable,
// at Unit + report level) and QA-05-02 (cross-programme totals avoid double counting, at Unit + scientific
// level). Two tests below carry the "at report level" names: they build the same rows and then read the
// exported document, because a verdict that never reaches the shareable file is not the accepted behaviour.
// The scientific claim itself — that these components overlap, and that only a reviewer can declare them
// disjoint — is still the human gate recorded as D-06.
//
// The survey side is built from the repository's real published artifacts, so these tests fail if the
// contract drifts away from the figures the dashboard actually shows. The administrative fixtures are
// synthetic: no authorised MINALOC/VUP register extract exists in this repository, and the counts below are
// inputs that stand in for one inside a unit test. None of them is displayed by the application.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reader } from "./districtUncertainty.js";
import {
  CONTRACT_VERSION,
  DATA_LINEAGE,
  UNITS,
  UNMAPPED_ADMIN_PROGRAMMES,
  VUP_COMPONENTS,
  VERDICT,
  VERDICT_LABELS,
  administrativeSide,
  buildReconciliation,
  compareParticipation,
  componentMemberships,
  evidenceCoverage,
  mappingIsSigned,
  periodBasis,
  reconciliationToCsv,
  sensitivityBand,
  surveySide,
  unitBasis,
  unitKind,
} from "./participationReconciliation.js";

const aggregates = JSON.parse(readFileSync(new URL("../data/dashboard-eicv7-aggregates.json", import.meta.url), "utf8"));
const uncertaintyDocument = JSON.parse(readFileSync(new URL("../data/dashboard-eicv7-uncertainty.json", import.meta.url), "utf8"));
const { withNationalUncertainty, withUncertainty } = reader(uncertaintyDocument);
const national = withNationalUncertainty(aggregates.national);
const districts = aggregates.districts.map(withUncertainty);
const district = (name) => districts.find((row) => row.name === name);

// Synthetic stand-in for an authorised register. Every field a complete reference needs is present so that
// the comparison rules, rather than availability, decide the verdict.
const completeReference = (overrides = {}) => ({
  definition: "one row per enrolled household, active at period end",
  unit: UNITS.REGISTERED_HOUSEHOLDS,
  period: "2023/24",
  status: "active",
  lastUpdated: "2024-09-30",
  count: 12500,
  sourceTable: "fixture_vup_register.beneficiary_households",
  permitted: true,
  ...overrides,
});

const unsignedMapping = { indicator: "fixture indicator", approvedBy: null, rationale: null, verified: false };
const signedMapping = {
  indicator: "fixture indicator",
  approvedBy: "Named reviewer supplied by the test fixture",
  rationale: "Test fixture only: the register row and the survey household frame count the same unit over the same fiscal year.",
  verified: true,
};

// A survey side already expressed as a count of households, which is what a signed mapping would have to
// produce before any gap could be arithmetic. `surveySide` itself only ever returns a share, so this object
// is written out here rather than fabricated by the module.
const surveyHouseholdCount = (overrides = {}) => ({
  side: "survey",
  estimand: "estimated_vup_households",
  definition: "test fixture: households implied by the survey estimate over the same frame",
  unit: UNITS.REGISTERED_HOUSEHOLDS,
  designUnit: "count_of_households",
  estimate: 12000,
  standardError: 300,
  interval: { low: 11400, high: 12600, method: "design" },
  sample: { observations: 100, psus: 40 },
  designDegreesOfFreedom: 1614,
  reliability: "moderate",
  publishable: true,
  period: "2023/24",
  source: "test fixture",
  evidenceNote: null,
  ...overrides,
});

const built = (options = {}) => buildReconciliation({
  national,
  district: district("Bugesera"),
  period: "2023/24",
  source: "NISR EICV7 2023/24",
  adminReference: null,
  membershipValues: { direct_support: 2.7, public_works_classic: 2.4, public_works_expanded: 2.1, financial_services: 2.0 },
  districtRows: districts,
  ...options,
});

// Walks every string a document can contain, so a claim cannot hide in a nested note.
const stringsIn = (value, found = []) => {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsIn(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => stringsIn(item, found));
  return found;
};

const CAUSAL = /\b(caused by|caused it|due to|because|proof that|demonstrates that|results from|leads to|is the reason|therefore the programme)\b/i;
const ACCUSATORY = /(fraud|ghost beneficiar|leakage|diversion|corruption|exclusion error)/i;

test("the survey side carries the estimate with its design record, and says so when the record is absent", () => {
  const bugesera = surveySide({ row: district("Bugesera"), measure: "vupAmongPoor", period: "2023/24", source: "NISR EICV7 2023/24" });
  assert.equal(bugesera.estimate, 13.9);
  assert.equal(bugesera.unit, UNITS.POOR_HOUSEHOLD_SHARE);
  assert.equal(bugesera.designUnit, "percent_of_surveyed_poor_households");
  assert.equal(bugesera.definition, "reported VUP participation in any S9D module");
  assert.equal(bugesera.standardError, 3.6163);
  assert.deepEqual(bugesera.interval, { low: 8.2, high: 22.6, method: "logit" });
  assert.deepEqual(bugesera.sample, { observations: 100, psus: 40 });
  assert.equal(bugesera.designDegreesOfFreedom, 1614);
  assert.equal(bugesera.reliability, district("Bugesera").vupEvidence.reliability);
  assert.equal(bugesera.evidenceNote, null);

  // National all-household coverage is published, but no design record for it exists in this build: the
  // contract states that instead of implying the figure arrived without uncertainty.
  const coverage = surveySide({ row: national, measure: "vupAmongAllHouseholds", period: "2023/24", source: "NISR EICV7 2023/24" });
  assert.equal(coverage.estimate, aggregates.national.vupAmongAllHouseholds);
  assert.equal(coverage.unit, UNITS.HOUSEHOLD_SHARE);
  assert.equal(coverage.standardError, null);
  assert.equal(coverage.interval, null);
  assert.match(coverage.evidenceNote, /no variance record for vupAmongAllHouseholds/);
  assert.match(coverage.evidenceNote, /not uncertainty-free/);

  assert.equal(surveySide({ row: null, measure: "vupAmongPoor", period: null, source: null }).estimate, null);
  assert.equal(surveySide({ row: {}, measure: "poverty", period: "2023/24" }).unit, UNITS.PERSON_SHARE);
});

test("acceptance case: unavailable administrative reference stays unresolved, never zero and never a check that passed", () => {
  for (const absent of [null, undefined, "nothing here", 0]) {
    const admin = administrativeSide(absent);
    assert.equal(admin.state, "not_available");
    assert.equal(admin.present, false);
    assert.equal(admin.count, null);
    assert.match(admin.reason, /MINALOC VUP register extract/);
    assert.match(admin.requiredActor, /statistics owner/);
  }

  const output = compareParticipation({
    title: "fixture row",
    survey: surveySide({ row: national, measure: "vupAmongAllHouseholds", period: "2023/24", source: "NISR EICV7 2023/24" }),
    admin: administrativeSide(null),
    mapping: unsignedMapping,
  });
  assert.equal(output.verdict, VERDICT.UNRESOLVED);
  assert.equal(output.verdictLabel, "Unresolved");
  assert.ok(output.reasons.includes("administrative_reference_unavailable"));
  assert.equal(output.difference, null);
  assert.match(stringsIn(output.statements).join(" "), /not evidence of a problem/);
});

test("acceptance case: permission failure keeps every register field out of the comparison", () => {
  const admin = administrativeSide(completeReference({ permitted: false }));
  assert.equal(admin.state, "not_permitted");
  assert.equal(admin.present, false);
  assert.equal(admin.count, null, "a refusal that leaves the count in the payload has not checked anything");
  assert.equal(admin.definition, null);
  assert.equal(admin.sourceTable, null);
  assert.equal(admin.withheldFromComparison.length, 7);
  assert.match(admin.reason, /Nothing about its contents is proven either way/);

  const output = compareParticipation({ title: "fixture row", survey: surveyHouseholdCount(), admin, mapping: signedMapping });
  assert.equal(output.verdict, VERDICT.NOT_PERMITTED);
  assert.ok(output.reasons.includes("administrative_reference_not_permitted"));
  assert.equal(output.difference, null);
  assert.equal(output.administrative.count, null);
});

test("acceptance case: a reference with a missing source is incomplete, names what is missing and stays unresolved", () => {
  const noSource = administrativeSide({ ...completeReference(), sourceTable: undefined, count: undefined });
  assert.equal(noSource.state, "incomplete");
  assert.deepEqual(noSource.missingFields, ["count", "source table"]);
  assert.match(noSource.reason, /A comparison needs all seven/);
  assert.match(noSource.requiredActor, /supply the missing fields/);

  const output = compareParticipation({ title: "fixture row", survey: surveyHouseholdCount(), admin: noSource, mapping: signedMapping });
  assert.equal(output.verdict, VERDICT.UNRESOLVED);
  assert.ok(output.reasons.some((reason) => reason.startsWith("administrative_reference_incomplete")));
  assert.match(output.reasons.join(" "), /source table/);
  assert.equal(output.difference, null);

  // A reference that states no period at all cannot be cleared as "same year" either.
  assert.equal(administrativeSide({ ...completeReference(), period: "" }).state, "incomplete");
});

test("acceptance case: person-versus-household mismatch is labelled, never differenced", () => {
  assert.equal(unitBasis(UNITS.PERSON_SHARE), "person");
  assert.equal(unitBasis(UNITS.REGISTERED_HOUSEHOLDS), "household");
  assert.equal(unitBasis(UNITS.REGISTERED_PERSONS), "person");
  assert.equal(unitBasis(UNITS.RECORD_COUNT), "unstated");

  const output = compareParticipation({
    title: "fixture row",
    survey: surveySide({ row: national, measure: "vupAmongAllHouseholds", period: "2023/24", source: "NISR EICV7 2023/24" }),
    admin: administrativeSide(completeReference({ unit: UNITS.REGISTERED_PERSONS })),
    mapping: signedMapping,
  });
  assert.equal(output.verdict, VERDICT.NOT_COMPARABLE, "a signature cannot repair two different populations");
  assert.ok(output.reasons.some((reason) => reason.startsWith("person_household_mismatch:")));
  assert.equal(output.difference, null, "subtracting a person-level figure from a household-level one is the failure this contract exists to prevent");
  assert.match(stringsIn(output.statements).join(" "), /not on the same scale/);

  // The same rule holds when the survey side is a share and the register counts households.
  const shareAgainstCount = compareParticipation({
    title: "fixture row",
    survey: surveySide({ row: national, measure: "vupAmongAllHouseholds", period: "2023/24", source: "NISR EICV7 2023/24" }),
    admin: administrativeSide(completeReference()),
    mapping: signedMapping,
  });
  assert.equal(shareAgainstCount.verdict, VERDICT.NOT_COMPARABLE);
  assert.ok(shareAgainstCount.reasons.some((reason) => reason.startsWith("share_vs_count_mismatch:")));
  assert.equal(shareAgainstCount.difference, null);
  assert.match(stringsIn(shareAgainstCount.statements).join(" "), /no conversion is offered/);
});

// QA-05-01 asks for "Unit + report" level: the mismatch has to survive into the shareable document, not only
// into the verdict object. The register count itself is still reported — refusing to print a count that a
// partner supplied would be its own kind of dishonesty — but the gap column refuses and the reason travels.
test("QA-05-01 at report level: a survey household figure against a person count exports as not comparable", () => {
  const row = compareParticipation({
    title: "Estimated VUP households versus registered persons",
    survey: surveySide({ row: national, measure: "vupAmongAllHouseholds", period: "2023/24", source: "NISR EICV7 2023/24" }),
    admin: administrativeSide(completeReference({ unit: UNITS.REGISTERED_PERSONS })),
    mapping: signedMapping,
  });
  assert.equal(row.verdict, VERDICT.NOT_COMPARABLE);

  const csv = reconciliationToCsv({
    contract: CONTRACT_VERSION,
    period: "2023/24",
    source: "NISR EICV7 2023/24",
    rows: [row],
  });
  const rowLines = csv.split("\r\n").filter((entry) => entry.includes('"Estimated VUP households versus registered persons"'));
  // The title repeats in the mapping table, the figures row and each of its limitation lines; what matters
  // is that exactly one of them carries the figures and that none of them carries a difference.
  assert.ok(rowLines.length >= 3, "the row is exported in every section that should mention it");
  const mappingLine = rowLines.find((entry) => entry.includes("Named reviewer supplied by the test fixture"));
  const figureLine = rowLines.find((entry) => entry.includes("not_comparable"));
  assert.ok(mappingLine?.includes('"true"'), "the mapping table shows this pairing as signed, so the refusal cannot be blamed on a missing signature");
  assert.ok(figureLine, "the export carries the verdict, not a blank");
  assert.ok(figureLine.includes("person_household_mismatch:"), "the export carries the reason a reviewer would need to fix");
  assert.ok(figureLine.includes("not calculated: definitions do not allow a difference"), "the gap column refuses instead of leaving a cell to subtract into");
  assert.ok(figureLine.includes('"12500"'), "the register count that was supplied is still reported");
  assert.equal(row.difference, null);
  // 12500 persons minus an 11.6% household share is the arithmetic this contract blocks; neither the row
  // object nor the export may contain it.
  assert.doesNotMatch(csv, /12488|12488\.4/, "no difference between the two scales is printed anywhere");
});

// QA-05-02 asks that cross-programme totals avoid double counting. The on-screen panel says it; a reviewer
// who only opens the exported document has to be told the same thing, with the same refusal to call the sum
// a number of households.
test("QA-05-02 at report level: overlapping components export as memberships with an explicit bound", () => {
  const csv = reconciliationToCsv(built());
  const componentLines = csv.split("\r\n").filter((entry) => entry.includes('"Direct support"') || entry.includes('"total"'));

  // Four components plus one total line, and nothing else in the document reuses those labels.
  assert.equal(componentLines.filter((entry) => entry.includes('"Direct support"')).length, 1);
  const totalLine = componentLines.find((entry) => entry.includes('"total"'));
  assert.ok(totalLine, "the export states a total rather than leaving a reader to add the column");
  assert.ok(totalLine.includes("9.2"), "the demo shares add to the figure the panel shows");
  assert.ok(totalLine.includes("overlap declared on at least one component"), "the total is labelled non-additive in its own row");
  assert.ok(totalLine.includes("upper bound on households and must not be read as one"), "the bound is stated in the export, not only on screen");
  assert.equal(componentLines.filter((entry) => entry.includes('"total"')).length, 1, "exactly one total is offered");

  // A component with no administrative counterpart says "none in this build"; it is never printed as zero.
  assert.ok(csv.includes('"none in this build"'), "an unmapped component is not exported as an empty count");
  assert.ok(csv.includes("proposed_unsigned") && csv.includes("unmapped_admin_side"), "the mapping state of each component travels with it");
  assert.ok(csv.includes('"VUP Direct Support"'), "the proposed administrative pairing is named, so a reviewer can reject it");
  assert.doesNotMatch(csv, /4845|4,845/, "demonstration record counts are not summed into a total that could read as enrolment");
});

// UPG-05 asks for "available coverage" in the contract. The only honest version of that is a count of the
// rows the application really renders, so it is computed here from the same artifacts the dashboard uses.
test("available coverage is counted from the rendered rows, and one register does not become thirty reconciliations", () => {
  const coverage = evidenceCoverage({ districtRows: districts, nationalRow: national, adminReferences: [] });
  assert.equal(coverage.surveyGeographies, 30, "the published artifact covers Rwanda's 30 EICV7 districts");
  assert.equal(coverage.surveyGeographiesWithInterval, districts.filter((row) => row.povertyInterval).length, "the count matches the rows, not a constant");
  assert.ok(coverage.surveyGeographiesWithInterval > 0, "districts really do carry design intervals, and the panel says how many");
  assert.equal(coverage.administrativeReferences, 0);
  assert.equal(coverage.reconcilableGeographies, 0, "with no register at all the reconcilable count is a fact of this build, not a guess");
  assert.match(coverage.statement, /Zero authorised administrative references/);
  assert.match(coverage.statement, /unpairable against a register/);

  const oneReference = evidenceCoverage({ districtRows: districts, nationalRow: national, adminReferences: [completeReference()] });
  assert.equal(oneReference.administrativeReferences, 1);
  assert.equal(oneReference.reconcilableGeographies, null, "one register does not make 30 districts reconcilable: pairing is per indicator and needs a signature");

  // A malformed reference is not coverage, and no rows means no claimed coverage either.
  assert.equal(evidenceCoverage({ districtRows: districts, adminReferences: [null, undefined, "not a reference"] }).administrativeReferences, 0);
  assert.equal(evidenceCoverage({}).surveyGeographies, 0);

  const csv = reconciliationToCsv(built());
  assert.ok(csv.includes('"available coverage"'), "the export states what it can and cannot measure");
  assert.ok(csv.includes("Zero authorised administrative references"), "the absence reaches the shareable document");
});

test("acceptance case: rolling twelve months against a fiscal year is a period problem, not a difference between places", () => {
  assert.equal(periodBasis("2023/24"), "fiscal_year");
  assert.equal(periodBasis("FY 2023/2024"), "fiscal_year");
  assert.equal(periodBasis("rolling 12 months to June 2024"), "rolling_12_months");
  assert.equal(periodBasis("2024"), "calendar_year");
  assert.equal(periodBasis("sometime last year"), "unstated");

  const output = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount(),
    admin: administrativeSide(completeReference({ period: "rolling 12 months to June 2024" })),
    mapping: signedMapping,
  });
  assert.equal(output.verdict, VERDICT.OUT_OF_PERIOD);
  assert.equal(output.verdictLabel, "Different period");
  assert.ok(output.reasons.some((reason) => reason.startsWith("period_mismatch:")));
  assert.equal(output.difference, null);
  assert.match(stringsIn(output.statements).join(" "), /cannot be differenced/);

  // A period on both sides that neither document classifies is its own stated reason.
  const vague = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount(),
    admin: administrativeSide(completeReference({ period: "recent" })),
    mapping: signedMapping,
  });
  assert.ok(vague.reasons.some((reason) => reason.startsWith("period_basis_unstated:")));
  assert.equal(vague.difference, null);
});

test("acceptance case: non-disjoint programmes sum to an upper bound of memberships, disjoint ones to households", () => {
  const overlapping = componentMemberships(VUP_COMPONENTS, {
    direct_support: 2.7,
    public_works_classic: 2.4,
    public_works_expanded: 2.1,
    financial_services: 2.0,
  });
  assert.ok(Math.abs(overlapping.total - 9.2) < 1e-9);
  assert.equal(overlapping.additive, false);
  assert.equal(overlapping.asUpperBoundOfMemberships, overlapping.total);
  assert.match(overlapping.note, /memberships, not households/);
  assert.match(overlapping.note, /upper bound/);
  assert.equal(overlapping.components.filter((item) => item.value === null).length, 0);

  const disjoint = componentMemberships(
    [
      { id: "a", surveyLabel: "Scheme A", overlapsWith: [], mappingState: "proposed_unsigned", note: "fixture" },
      { id: "b", surveyLabel: "Scheme B", overlapsWith: [], mappingState: "proposed_unsigned", note: "fixture" },
    ],
    { a: 5, b: 3 },
  );
  assert.equal(disjoint.total, 8);
  assert.equal(disjoint.additive, true);
  assert.equal(disjoint.asUpperBoundOfMemberships, null);
  assert.match(disjoint.note, /declared disjoint/);

  // A missing component value is not silently read as zero participation.
  const partial = componentMemberships(VUP_COMPONENTS, { direct_support: 2.7 });
  assert.equal(partial.components.find((item) => item.id === "public_works_expanded").value, null);
});

test("the component map is one-to-many and never claims a mapping nobody signed", () => {
  for (const component of VUP_COMPONENTS) {
    assert.ok(Array.isArray(component.adminTypes), `${component.id} must state its administrative side, even when empty`);
    assert.notEqual(component.mappingState, "signed_off");
    assert.ok(component.note.length > 20, `${component.id} needs a reason a reader can act on`);
    if (component.adminTypes.length === 0) {
      assert.equal(component.mappingState, "unmapped_admin_side");
    }
  }
  assert.equal(VUP_COMPONENTS.some((component) => component.overlapsWith.length > 0), true);
  for (const programme of UNMAPPED_ADMIN_PROGRAMMES) {
    assert.ok(programme.reason.length > 20);
    assert.equal(VUP_COMPONENTS.some((component) => component.adminTypes.includes(programme.name)), false);
  }
});

test("a difference is calculated only through a signed mapping over an aligned unit and period", () => {
  assert.equal(mappingIsSigned(signedMapping), true);
  assert.equal(mappingIsSigned({ ...signedMapping, approvedBy: "   " }), false);
  assert.equal(mappingIsSigned({ ...signedMapping, rationale: null }), false);
  assert.equal(mappingIsSigned({ ...signedMapping, verified: false }), false);
  assert.equal(mappingIsSigned(null), false);

  const aligned = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount(),
    admin: administrativeSide(completeReference()),
    mapping: signedMapping,
  });
  assert.equal(aligned.verdict, VERDICT.COMPARABLE);
  assert.equal(aligned.reasons.length, 0);
  assert.deepEqual(aligned.difference, {
    survey: 12000,
    administrative: 12500,
    gap: 500,
    unit: UNITS.REGISTERED_HOUSEHOLDS,
    note: aligned.difference.note,
  });
  assert.match(aligned.difference.note, /not proof about the programme/);

  // Identical figures, no signature: the gap is withheld, which mirrors the governed engine's rule in
  // engine/ireme/semantics.py that an equivalence needs a named reviewer and a rationale.
  const unsigned = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount(),
    admin: administrativeSide(completeReference()),
    mapping: unsignedMapping,
  });
  assert.equal(unsigned.verdict, VERDICT.UNAPPROVED);
  assert.equal(unsigned.difference, null);
  assert.ok(unsigned.reasons.includes("mapping_unsigned"));
  assert.equal(unsigned.mapping.signed, false);
});

test("an unestimable survey domain is reported as unestimable, not replaced with zero or a neighbouring figure", () => {
  const missing = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount({ estimate: null, standardError: null, interval: null }),
    admin: administrativeSide(completeReference()),
    mapping: signedMapping,
  });
  assert.equal(missing.verdict, VERDICT.NOT_ESTIMATED);
  assert.ok(missing.reasons.includes("survey_estimate_missing"));
  assert.equal(missing.difference, null);
  assert.match(stringsIn(missing.statements).join(" "), /instead of substituting zero/);

  const belowFloor = compareParticipation({
    title: "fixture row",
    survey: surveyHouseholdCount({ publishable: false, reliability: "unreliable" }),
    admin: administrativeSide(completeReference()),
    mapping: signedMapping,
  });
  assert.equal(belowFloor.verdict, VERDICT.NOT_ESTIMATED);
  assert.ok(belowFloor.reasons.includes("survey_domain_below_publishable_floor"));
  assert.equal(belowFloor.difference, null);
});

test("the built reconciliation reaches no comparable row, and states an unresolved category out loud", () => {
  const document = built();
  assert.equal(document.contract, CONTRACT_VERSION);
  assert.equal(document.rows.length, 3);
  for (const item of document.rows) {
    assert.equal(item.contract, CONTRACT_VERSION);
    assert.notEqual(item.verdict, VERDICT.COMPARABLE, "nothing in this build has a signed mapping and a register");
    assert.equal(item.difference ?? null, null);
    assert.ok(item.reasons.length > 0, `${item.title} must say why`);
    assert.ok(VERDICT_LABELS[item.verdict], `${item.verdict} needs reader-facing wording`);
  }
  assert.equal(document.rows[0].verdict, VERDICT.UNRESOLVED);
  assert.equal(document.rows[1].verdict, VERDICT.UNRESOLVED);
  assert.equal(document.rows[2].verdict, VERDICT.NOT_COMPARABLE);
  assert.deepEqual(document.rows[2].reasons, ["demonstration_records", "different_frame"]);
  assert.match(document.rows[2].interpretationLimit, /demonstration record is not an observation/);
  assert.equal(document.rows[2].memberships.additive, false);
  assert.equal(document.rows[0].survey.estimate, national.vupAmongAllHouseholds);
  assert.equal(document.rows[1].survey.estimate, district("Bugesera").vupAmongPoor);
  assert.equal(document.rows[1].survey.definition, "reported VUP participation in any S9D module");

  // The district is used when one is supplied, and the national figure stands in when none is.
  const nationalOnly = built({ district: null });
  assert.equal(nationalOnly.rows[1].survey.estimate, national.vupAmongPoor);
});

test("a sensitivity range is refused without stated assumptions and marked as illustration with them", () => {
  const refused = sensitivityBand({ low: 4, high: 9 });
  assert.equal(refused.available, false);
  assert.equal(refused.illustrative, false);
  assert.match(refused.reason, /dressed as analysis/);
  assert.equal(refused.low, undefined);

  assert.equal(sensitivityBand({ low: 9, high: 4, assumptions: ["fixture"], basis: "fixture" }).available, false);
  assert.equal(sensitivityBand({ low: 4, high: 9, assumptions: ["  "], basis: "fixture" }).available, false);
  assert.equal(sensitivityBand({ low: 4, high: 9, assumptions: ["fixture"], basis: "" }).available, false);

  const band = sensitivityBand({
    low: 10.5,
    high: 12.4,
    assumptions: ["Assume the register under-records 5 percent of eligible households at period end."],
    basis: "Test fixture: shows what an under-registration assumption would imply.",
  });
  assert.equal(band.available, true);
  assert.equal(band.illustrative, true);
  assert.equal(band.low, 10.5);
  assert.equal(band.high, 12.4);
  assert.match(band.note, /Illustration only/);
  assert.match(band.note, /not an observation/);
});

test("no sentence in a reconciliation document claims a cause, and an accusation only appears inside a denial", () => {
  const document = built();
  const text = stringsIn(document)
    .concat(stringsIn(componentMemberships(VUP_COMPONENTS, {})))
    .concat(stringsIn(VERDICT_LABELS))
    .concat(stringsIn(sensitivityBand({ low: 1, high: 2, assumptions: ["fixture"], basis: "fixture" })));

  for (const value of text) {
    assert.doesNotMatch(value, CAUSAL, `causal wording in: ${value}`);
    if (ACCUSATORY.test(value)) {
      assert.match(value, /not evidence|is not|never|no such/i, `an accusation without a denial: ${value}`);
    }
  }
  assert.ok(text.some((value) => /not evidence of fraud, ghost beneficiaries or exclusion/.test(value)));
});

test("the export carries its mapping table, uncertainty, limitations and lineage as labelled sections", () => {
  const csv = reconciliationToCsv(built());
  const lines = csv.split("\r\n");

  for (const section of ["# 1. Mapping table", "# 2. Reconciliation rows with their uncertainty", "# 3. Stated limitations", "# 4. Data lineage", "# 5. Programme components"]) {
    assert.ok(csv.includes(section), `missing section ${section}`);
  }
  assert.ok(csv.includes("approved_by") && csv.includes("signed"), "the mapping table has to show who signed it");
  assert.ok(csv.includes('"false"'), "unsigned rows are exported as unsigned");
  assert.ok(csv.includes("unresolved"), "the unresolved category is in the export, not only in the UI");
  assert.ok(csv.includes("not calculated"), "a comparison the definitions forbid says so instead of leaving a blank");
  assert.ok(csv.includes("11.6"), "the published national coverage figure travels with the row");
  assert.ok(csv.includes(CONTRACT_VERSION));
  for (const entry of DATA_LINEAGE) assert.ok(csv.includes(entry.artifact), `lineage row missing for ${entry.role}`);
  assert.ok(csv.includes("src/data/dashboard-eicv7-uncertainty.json"));
  assert.ok(csv.includes("engine/ireme/semantics.py"));
  assert.ok(csv.includes("not present in this build"), "the absence of a register is part of the lineage");
  assert.ok(!csv.includes("A comparison needs all seven"), "an unavailable register is not described as an incomplete one");

  for (const line of lines) {
    if (!line.length) continue;
    assert.match(line, /^"/, "every cell is quoted, so a comma or quote in prose cannot split a row");
  }
  // Written without the literal service-role key name on purpose:
  // `engine/tests/test_gateway.py::FrontendBundle::test_no_secret_patterns_in_frontend_source_or_built_bundle`
  // scans every file under `src/`, and a privacy test that trips the platform's own secret guard is a false
  // positive that would get the guard weakened. `service.role` still matches the real token (and any other
  // separator), so the assertion keeps its teeth.
  assert.doesNotMatch(csv, /service.role|SUPABASE|anon.key|\.env\.local|\beyJ[A-Za-z0-9_-]{8,}/i, "the export never carries credentials or local configuration");
  // The licensed EICV7 files, their directory layout and the household key inside them stay in the analysis
  // tool. Naming them here would put a private dataset reference in a shareable artifact.
  assert.doesNotMatch(csv, /\.dta\b|Cross_Section\/|\bhhid\b|\bs9d\dq\d\b/i, "the export never carries licensed microdata references or household identifiers");
  assert.ok(csv.includes("the licensed microdata"), "the lineage says in prose that the microdata was used and not exported");
  assert.ok(csv.includes("not in this repository"));

  // Quoted prose survives the round trip as one cell.
  const awkward = reconciliationToCsv({
    contract: CONTRACT_VERSION,
    period: 'says "both"',
    source: null,
    rows: [{ title: "row, with a comma", verdict: VERDICT.UNRESOLVED, verdictLabel: "Unresolved", verdictNote: "n", reasons: [], statements: [], survey: null, administrative: null, mapping: null, difference: null, interpretationLimit: "limit" }],
  });
  assert.ok(awkward.includes('"says ""both"""'));
  assert.equal(awkward.split("\r\n")[0].startsWith('"'), true);
});
