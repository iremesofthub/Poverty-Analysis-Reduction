import test from "node:test";
import assert from "node:assert/strict";
import { countObservationsBySource, filterObservationsByActiveSources, mapFinancialAccessRows, parseEvidenceFlags, selectCompleteNationalAccessStrand, selectDistrictAccess, selectNationalSeries, selectProvinceSeries, selectTrendComparison } from "./financialInclusion.js";

const rows = [
  { indicator: "access_strand_excluded", value: 4, source_id: "fin", geography_level: "national", segment: null, table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Adults 16+", denominator: "Adults", },
  { indicator: "access_strand_banked", value: 22, source_id: "fin", geography_level: "national", segment: null, table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Adults 16+", denominator: "Adults", },
  { indicator: "access_strand_other_formal_nonbank", value: 70, source_id: "fin", geography_level: "national", segment: null, table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Adults 16+", denominator: "Adults", },
  { indicator: "access_strand_informal_only", value: 4, source_id: "fin", geography_level: "national", segment: null, table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Adults 16+", denominator: "Adults", },
  { indicator: "access_strand_banked", value: 17, source_id: "fin", geography_level: "national", segment: "Female", table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Female adults", denominator: "Female adults", },
  { indicator: "access_strand_banked", value: 20, source_id: "fin", geography_level: "district", segment: null, table_reference: "p.27", methodology: "survey", period_end: "2024-12-31", population: "Adults", denominator: "Adults", },
];

test("national pie categories map in display order and exclude segments/geographies", () => {
  const result = mapFinancialAccessRows(rows);
  assert.deepEqual(result.map((row) => row.key), [
    "access_strand_banked", "access_strand_other_formal_nonbank", "access_strand_informal_only", "access_strand_excluded",
  ]);
  assert.deepEqual(result.map((row) => row.value), [22, 70, 4, 4]);
  assert.equal(result.reduce((sum, row) => sum + row.value, 0), 100);
  assert.equal(result[0].tableReference, "p.27");
});

test("source counts are derived from loaded observation rows", () => {
  assert.deepEqual(countObservationsBySource([{ source_id: "fin" }, { source_id: "fin" }, { source_id: "roadmap" }]), { fin: 2, roadmap: 1 });
});

test("a newer complete national Access Strand is selected, while incomplete uploads are ignored", () => {
  const complete = [
    ...rows.filter((row) => row.indicator.startsWith("access_strand_")),
    { indicator: "overall_inclusion_access_strand", value: 96, source_id: "new", geography_level: "national", segment: null, period_end: "2026-12-31" },
  ].map((row) => ({ ...row, source_id: "new", period_end: "2026-12-31" }));
  const result = selectCompleteNationalAccessStrand([...rows, ...complete, { indicator: "access_strand_banked", value: 99, source_id: "incomplete", geography_level: "national", segment: null, period_end: "2027-01-01" }]);
  assert.equal(result.sourceId, "new");
});

test("superseded or failed sources never drive the chart, even with newer periods", () => {
  const finOverall = { indicator: "overall_inclusion_access_strand", value: 96, source_id: "fin", geography_level: "national", segment: null, period_end: "2024-12-31" };
  const newer = [
    ...rows.filter((row) => row.indicator.startsWith("access_strand_")),
    { indicator: "overall_inclusion_access_strand", value: 97, source_id: "stale", geography_level: "national", segment: null, period_end: "2030-12-31" },
  ].map((row) => ({ ...row, source_id: "stale", period_end: "2030-12-31" }));
  const sources = [
    { source_id: "fin", status: "Imported" },
    { source_id: "stale", status: "Superseded" },
    { source_id: "broken", status: "Validation failed" },
  ];
  const filtered = filterObservationsByActiveSources([...rows, finOverall, ...newer], sources);
  assert.equal(filtered.every((row) => row.source_id === "fin"), true);
  assert.equal(selectCompleteNationalAccessStrand(filtered).sourceId, "fin");
});

test("evidence flags decode intervals, changes, samples and published references", () => {
  const parsed = parseEvidenceFlags([
    "ci95:11.06:22.94",
    "chg:-16.0:-22.2:-9.8:0.0000:Clear_fall_(Holm)",
    "sample:416",
    "published-ref:60",
    "estimated",
  ]);
  assert.deepEqual(parsed.ci, { lower: 11.06, upper: 22.94 });
  assert.deepEqual(parsed.change, { points: -16, ciLower: -22.2, ciUpper: -9.8, p: 0, label: "Clear fall (Holm)" });
  assert.equal(parsed.sample, 416);
  assert.equal(parsed.publishedRef, 60);
  assert.deepEqual(parsed.tags, ["estimated"]);
  assert.deepEqual(parseEvidenceFlags([]), { ci: null, change: null, sample: null, publishedRef: null, tags: [] });
});

test("district access needs a complete set of 30 published districts", () => {
  const base = (name, indicator, value) => ({ source_id: "d", geography_level: "district", geography_name: name, segment: null, indicator, value, period_end: "2024-12-31", quality_flags: [] });
  const incomplete = ["Banked"].flatMap((name) => [
    base(name, "access_strand_banked", 22), base(name, "access_strand_other_formal_nonbank", 70), base(name, "access_strand_informal_only", 4),
  ]);
  assert.equal(selectDistrictAccess(incomplete), null);
  const districts = Array.from({ length: 30 }, (_, index) => `D${index}`);
  const complete = districts.flatMap((name, index) => [
    { ...base(name, "access_strand_banked", index), quality_flags: ["sample:520"] },
    base(name, "access_strand_other_formal_nonbank", index),
    base(name, "access_strand_informal_only", index),
    { ...base(name, "access_strand_excluded", index), quality_flags: index === 0 ? ["derived-remainder"] : [] },
  ]);
  const result = selectDistrictAccess(complete);
  assert.equal(result.length, 30);
  assert.equal(result[0].published.banked, 0);
  assert.equal(result[0].excludedPrinted, false);
  assert.equal(result[1].excludedPrinted, true);
  assert.equal(result[0].sampleAdults, 520);
});

const trendRow = (segment, indicator, value, name, flags = []) => ({
  source_id: "t", geography_level: "district", geography_name: name, segment, indicator, value, quality_flags: flags,
});
const trendDistricts = ["A", "B"].flatMap((name, index) => [
  trendRow("trend-2020", "access_strand_excluded", 17, name, [`ci95:13.9:20.1`, `chg:-16.0:-22.2:-9.8:0.0000:Clear_fall`, "sample:416"]),
  trendRow("trend-2024", "access_strand_excluded", 1, name, ["sample:470"]),
  trendRow("trend-2020", "access_strand_informal_only", 5, name, [`ci95:3:${5 + index}`]),
  trendRow("trend-2024", "access_strand_informal_only", 4, name),
  trendRow("trend-2020", "formal_inclusion_access_strand", 70, name),
  trendRow("trend-2024", "formal_inclusion_access_strand", 75, name),
  trendRow("trend-2020", "registered_mobile_money_users", 61, name),
  trendRow("trend-2024", "registered_mobile_money_users", 77, name),
]);

test("trend comparisons decode district changes, verdict counts and national restatements", () => {
  const comparison = selectTrendComparison(trendDistricts);
  const districtA = comparison.districts.find((row) => row.name === "A");
  assert.deepEqual(districtA.excluded.y2020, { pct: 17, ci_lower: 13.9, ci_upper: 20.1 });
  assert.equal(districtA.excluded.y2024, 1);
  assert.equal(districtA.excluded.change.label, "Clear fall");
  assert.equal(districtA.sampleAdults2020, 416);
  assert.equal(districtA.sampleAdults2024, 470);
  assert.equal(comparison.counts.excluded["Clear fall"], 2);
  assert.equal(comparison.counts.excluded["Clear rise"], 0);
  const series = [
    trendRow("series-2016", "access_strand_banked", 26, "Rwanda"),
    { ...trendRow("series-2016", "formal_inclusion_access_strand", 42, "Rwanda"), geography_level: "national" },
    { ...trendRow("series-2020", "registered_mobile_money_users", 61, "Rwanda"), geography_level: "national", quality_flags: ["published-ref:60"] },
    { ...trendRow("series-2020-restated", "access_strand_banked", 22, "Rwanda"), geography_level: "national" },
    { ...trendRow("series-2024", "registered_mobile_money_users", 77, "Rwanda"), geography_level: "national", quality_flags: ["published-ref:77"] },
  ];
  const national = selectNationalSeries(series);
  assert.deepEqual(national.series.map((row) => row.key), ["2016", "2020", "2020r", "2024"]);
  assert.equal(national.y2020Microdata.banked, undefined);
  assert.equal(national.y2020Restated.banked, 22);
  assert.equal(national.mobileMoney.published[2020], 60);
  assert.equal(national.mobileMoney.published[2024], 77);
});

test("provincial series pair 2016 with 2020 and carry the decoded change", () => {
  const row = (segment, indicator, value, name, flags = []) => ({ source_id: "p", geography_level: "province", geography_name: name, segment, indicator, value, period_end: segment === "province-2016" ? "2016-12-31" : "2020-12-31", quality_flags: flags });
  const provinces = ["Eastern", "Kigali"].flatMap((name, index) => [
    row("province-2016", "access_strand_banked", index ? 7.7 : 4.3, name, index ? [] : ["chg:-0.6:-1.9:0.7:0.4:No_clear_change", "sample:1200"]),
    row("province-2020", "access_strand_banked", index ? 6.9 : 3.8, name, ["sample:416"]),
    row("province-2016", "access_strand_other_formal_nonbank", 30, name),
    row("province-2020", "access_strand_other_formal_nonbank", 33, name),
    row("province-2016", "access_strand_informal_only", 40 + index, name),
    row("province-2020", "access_strand_informal_only", 41 + index, name),
    row("province-2016", "access_strand_excluded", index ? 6.6 : 10.3, name),
    row("province-2020", "access_strand_excluded", index ? 5.4 : 9.7, name),
  ]);
  const rows = selectProvinceSeries(provinces);
  assert.equal(rows.length, 2);
  const eastern = rows.find((row) => row.province === "Eastern");
  assert.equal(eastern.excluded.y2016, 10.3);
  assert.equal(eastern.excluded.y2020, 9.7);
  assert.equal(eastern.excluded.change, undefined);
  assert.equal(eastern.banked.change.label, "No clear change");
  assert.equal(eastern.sampleAdults2016, 1200);
  assert.equal(eastern.sampleAdults2020, 416);
});
