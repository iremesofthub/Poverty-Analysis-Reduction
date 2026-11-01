export const FINANCIAL_ACCESS_ORDER = [
  { key: "access_strand_banked", label: "Banked", color: "#635BFF" },
  { key: "access_strand_other_formal_nonbank", label: "Other formal (non-bank)", color: "#14B8A6" },
  { key: "access_strand_informal_only", label: "Informal only", color: "#F5A623" },
  { key: "access_strand_excluded", label: "Excluded", color: "#E3E8EE" },
];

export function mapFinancialAccessRows(rows = []) {
  const values = new Map(rows
    .filter((row) => row.geography_level === "national" && !row.segment)
    .map((row) => [row.indicator, row]));
  return FINANCIAL_ACCESS_ORDER.flatMap((category) => {
    const row = values.get(category.key);
    return row ? [{ ...category, value: Number(row.value), sourceId: row.source_id, tableReference: row.table_reference, methodology: row.methodology, periodEnd: row.period_end, population: row.population, denominator: row.denominator }] : [];
  });
}

// Sources whose records may drive the charts. Superseded or failed-validation
// sources stay in the evidence tables for provenance but never replace the
// displayed figures, even when their period_end is newer.
const ACTIVE_SOURCE_STATUSES = new Set(["Imported", "Published but not downloaded"]);

export function filterObservationsByActiveSources(observations = [], sources = []) {
  const active = new Set(sources.filter((source) => ACTIVE_SOURCE_STATUSES.has(source.status)).map((source) => source.source_id));
  return observations.filter((row) => active.has(row.source_id));
}

// A newly approved source can replace the displayed national Access Strand only
// when it supplies the complete, mutually exclusive national set. Other uploads
// (for example BNR provider aggregates) cannot silently replace this survey chart.
export function selectCompleteNationalAccessStrand(observations = []) {
  const bySource = new Map();
  for (const row of observations) {
    if (row.geography_level !== "national" || row.segment) continue;
    const rows = bySource.get(row.source_id) || [];
    rows.push(row);
    bySource.set(row.source_id, rows);
  }
  const required = new Set([...FINANCIAL_ACCESS_ORDER.map((item) => item.key), "overall_inclusion_access_strand"]);
  const candidates = [...bySource.entries()].map(([sourceId, rows]) => ({ sourceId, rows, periodEnd: rows.map((row) => row.period_end || "").sort().at(-1) || "" }))
    .filter((candidate) => required.isSubsetOf(new Set(candidate.rows.map((row) => row.indicator))))
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  return candidates[0] || null;
}

export function countObservationsBySource(observations = []) {
  return observations.reduce((counts, row) => {
    counts[row.source_id] = (counts[row.source_id] || 0) + 1;
    return counts;
  }, {});
}

// ---------------------------------------------------------------------------
// Trend/district selectors for the governed FinScope evidence tables.
//
// Convention (set by the governed import, see scripts + docs):
//  - Published 2024 district Access Strand rows: geography_level "district",
//    no segment, indicators access_strand_banked/other_formal_nonbank/
//    informal_only/excluded.
//  - Microdata-derived trend rows carry a segment tag ("trend-2020",
//    "trend-2024", "series-2016", "series-2020", "series-2020-restated",
//    "series-2024", "province-2016", "province-2020") so they never compete
//    with the headline national Access Strand.
//  - Derived uncertainty rides in quality_flags:
//      ci95:{lo}:{hi}                 95% interval for the point estimate
//      chg:{pts}:{lo}:{hi}:{p}:{label} change vs the earlier survey (one label,
//                                     underscores restored to spaces)
//      sample:{n}                     surveyed adults for the row's period
//      published-ref:{v}              NISR's published figure for an estimate
//      estimated / derived-remainder  plain tags
// ---------------------------------------------------------------------------

const flagNumber = (token) => (token === "null" || token === "" ? null : Number(token));

export function parseEvidenceFlags(flags = []) {
  const parsed = { ci: null, change: null, sample: null, publishedRef: null, tags: [] };
  for (const flag of flags) {
    const [kind, ...rest] = String(flag).split(":");
    if (kind === "ci95") parsed.ci = { lower: flagNumber(rest[0]), upper: flagNumber(rest[1]) };
    else if (kind === "chg") parsed.change = { points: Number(rest[0]), ciLower: Number(rest[1]), ciUpper: Number(rest[2]), p: flagNumber(rest[3]), label: (rest[4] || "").replace(/_/g, " ") };
    else if (kind === "sample") parsed.sample = Number(rest[1] ?? rest[0]);
    else if (kind === "published-ref") parsed.publishedRef = flagNumber(rest[0]);
    else parsed.tags.push(flag);
  }
  return parsed;
}

const STRAND_KEYS = {
  access_strand_banked: "banked",
  access_strand_other_formal_nonbank: "otherFormal",
  access_strand_informal_only: "informalOnly",
  access_strand_excluded: "excluded",
};

// Newest active source that publishes the complete published district strand.
export function selectDistrictAccess(observations = []) {
  const districtRows = observations.filter((row) => row.geography_level === "district" && !row.segment && STRAND_KEYS[row.indicator]);
  const bySource = new Map();
  for (const row of districtRows) {
    const list = bySource.get(row.source_id) || [];
    list.push(row);
    bySource.set(row.source_id, list);
  }
  const ranked = [...bySource.entries()].sort((left, right) => {
    const periodOf = (rows) => rows.map((row) => row.period_end || "").sort().at(-1) || "";
    return periodOf(right[1]).localeCompare(periodOf(left[1]));
  });
  for (const [, rows] of ranked) {
    const byDistrict = new Map();
    for (const row of rows) {
      const district = byDistrict.get(row.geography_name) || {};
      district[STRAND_KEYS[row.indicator]] = Number(row.value);
      district.name = row.geography_name;
      const flags = parseEvidenceFlags(row.quality_flags || []);
      if (flags.sample) district.sampleAdults = flags.sample;
      if (flags.tags.includes("derived-remainder") && STRAND_KEYS[row.indicator] === "excluded") district.excludedPrinted = false;
      byDistrict.set(row.geography_name, district);
    }
    const complete = [...byDistrict.values()].filter((item) => item.banked !== undefined && item.otherFormal !== undefined && item.informalOnly !== undefined && item.excluded !== undefined);
    if (complete.length >= 30) {
      return complete.map((item) => ({ name: item.name, published: { banked: item.banked, otherFormal: item.otherFormal, informalOnly: item.informalOnly, excluded: item.excluded }, excludedPrinted: item.excludedPrinted !== false, sampleAdults: item.sampleAdults ?? null }));
    }
  }
  return null;
}

const TREND_MEASURES = {
  access_strand_excluded: "excluded",
  access_strand_informal_only: "informal_only",
  formal_inclusion_access_strand: "formal",
  registered_mobile_money_users: "mobile_money",
};

// District 2020 -> 2024 comparison rows shaped like FINANCE_CHANGE_DISTRICTS,
// the national restatement rows, and the verdict counts, from the trend source.
export function selectTrendComparison(observations = []) {
  const rows = observations.filter((row) => TREND_MEASURES[row.indicator] && ["trend-2020", "trend-2024"].includes(row.segment));
  if (!rows.length) return null;
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.geography_name}|${TREND_MEASURES[row.indicator]}`;
    const entry = grouped.get(key) || {};
    const flags = parseEvidenceFlags(row.quality_flags || []);
    if (row.segment === "trend-2020") {
      entry.y2020 = { pct: Number(row.value), ci_lower: flags.ci?.lower ?? Number(row.value), ci_upper: flags.ci?.upper ?? Number(row.value) };
      entry.change = flags.change ? { points: flags.change.points, ci_lower: flags.change.ciLower, ci_upper: flags.change.ciUpper, holm_adjusted_p: flags.change.p, label: flags.change.label } : null;
      entry.sample2020 = flags.sample;
    } else {
      entry.y2024 = Number(row.value);
      entry.sample2024 = flags.sample;
    }
    grouped.set(key, entry);
  }
  const names = [...new Set(rows.map((row) => row.geography_name))];
  const districts = names.map((name) => {
    const district = { name };
    for (const measure of Object.values(TREND_MEASURES)) {
      const entry = grouped.get(`${name}|${measure}`);
      if (entry?.y2020 && entry?.y2024 !== undefined) district[measure] = { y2020: entry.y2020, y2024: entry.y2024, change: entry.change };
    }
    district.sampleAdults2020 = grouped.get(`${name}|excluded`)?.sample2020 ?? null;
    district.sampleAdults2024 = grouped.get(`${name}|excluded`)?.sample2024 ?? null;
    return district;
  }).filter((district) => ["excluded", "informal_only", "formal", "mobile_money"].every((measure) => district[measure]));
  const verdictKey = (label = "") => (label.startsWith("Clear rise") ? "Clear rise" : label.startsWith("Clear fall") ? "Clear fall" : label.startsWith("Possible") ? "Possible" : "No clear change");
  const counts = {};
  for (const measure of Object.values(TREND_MEASURES)) {
    counts[measure] = { "Clear fall": 0, "Clear rise": 0, Possible: 0, "No clear change": 0 };
    for (const district of districts) {
      const change = district[measure]?.change;
      if (change) counts[measure][verdictKey(change.label)] += 1;
    }
  }
  const national = selectNationalSeries(observations);
  return { districts, counts, national };
}

const SERIES_SEGMENTS = ["series-2016", "series-2020", "series-2020-restated", "series-2024"];
const SERIES_INDICATORS = {
  access_strand_banked: "banked",
  access_strand_other_formal_nonbank: "other_formal",
  access_strand_informal_only: "informal_only",
  access_strand_excluded: "excluded",
  formal_inclusion_access_strand: "formal",
  registered_mobile_money_users: "mobile_money",
};

export function selectNationalSeries(observations = []) {
  const rows = observations.filter((row) => row.geography_level === "national" && SERIES_SEGMENTS.includes(row.segment) && SERIES_INDICATORS[row.indicator]);
  if (!rows.length) return null;
  const bySegment = new Map();
  for (const row of rows) {
    const entry = bySegment.get(row.segment) || {};
    const flags = parseEvidenceFlags(row.quality_flags || []);
    entry[SERIES_INDICATORS[row.indicator]] = Number(row.value);
    if (flags.publishedRef !== null) entry[`${SERIES_INDICATORS[row.indicator]}_published`] = flags.publishedRef;
    bySegment.set(row.segment, entry);
  }
  const keyOf = { "series-2016": "2016", "series-2020": "2020", "series-2020-restated": "2020r", "series-2024": "2024" };
  const series = Object.entries(keyOf).filter(([segment]) => bySegment.has(segment)).map(([segment]) => ({ key: keyOf[segment], ...bySegment.get(segment) }));
  return {
    series,
    y2020Microdata: bySegment.get("series-2020") || null,
    y2020Restated: bySegment.get("series-2020-restated") || null,
    y2024: bySegment.get("series-2024") || null,
    mobileMoney: {
      2020: bySegment.get("series-2020")?.mobile_money ?? null,
      2024: bySegment.get("series-2024")?.mobile_money ?? null,
      published: { 2020: bySegment.get("series-2020")?.mobile_money_published ?? null, 2024: bySegment.get("series-2024")?.mobile_money_published ?? null },
    },
  };
}

const PROVINCE_INDICATORS = SERIES_INDICATORS;

export function selectProvinceSeries(observations = []) {
  const rows = observations.filter((row) => row.geography_level === "province" && ["province-2016", "province-2020"].includes(row.segment) && PROVINCE_INDICATORS[row.indicator]);
  if (!rows.length) return null;
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.geography_name}|${PROVINCE_INDICATORS[row.indicator]}`;
    const entry = grouped.get(key) || {};
    const flags = parseEvidenceFlags(row.quality_flags || []);
    if (row.segment === "province-2016") {
      entry.y2016 = Number(row.value);
      entry.change = flags.change ? { points: flags.change.points, ci_lower: flags.change.ciLower, ci_upper: flags.change.ciUpper, holm_adjusted_p: flags.change.p, label: flags.change.label } : null;
      entry.sample2016 = flags.sample;
    } else {
      entry.y2020 = Number(row.value);
      entry.sample2020 = flags.sample;
    }
    grouped.set(key, entry);
  }
  const names = [...new Set(rows.map((row) => row.geography_name))];
  return names.map((name) => {
    const province = { province: name };
    for (const measure of Object.values(PROVINCE_INDICATORS)) {
      const entry = grouped.get(`${name}|${measure}`);
      if (entry && entry.y2016 !== undefined && entry.y2020 !== undefined) province[measure] = { y2016: entry.y2016, y2020: entry.y2020, change: entry.change ?? undefined };
    }
    province.sampleAdults2016 = grouped.get(`${name}|banked`)?.sample2016 ?? null;
    province.sampleAdults2020 = grouped.get(`${name}|banked`)?.sample2020 ?? null;
    return province;
  }).filter((province) => ["banked", "other_formal", "informal_only", "excluded"].every((measure) => province[measure]));
}
