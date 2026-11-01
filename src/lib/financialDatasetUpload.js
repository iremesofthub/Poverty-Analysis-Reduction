const REQUIRED = ["observation_id", "indicator", "indicator_label", "value", "unit", "period_end", "geography_level", "population", "denominator", "table_reference", "methodology"];
const OPTIONAL = ["period_start", "geography_code", "geography_name", "provider_class", "product", "segment_type", "segment", "quality_flags", "transformation"];

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') { row.push(field); field = ""; }
    else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const clean = (value) => String(value ?? "").trim();
const dateOrNull = (value) => clean(value) || null;

export function readAggregateCsv(text) {
  const rows = parseCsv(String(text || "").replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Add a header row and at least one aggregate data row.");
  const headers = rows[0].map((header) => clean(header).toLowerCase());
  const missing = REQUIRED.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(", ")}.`);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const observations = rows.slice(1).map((row, index) => {
    const read = (key) => clean(row[indexes[key]]);
    const value = Number(read("value"));
    const geographyLevel = read("geography_level").toLowerCase();
    const quality = read("quality_flags");
    if (!Number.isFinite(value)) throw new Error(`Row ${index + 2}: value must be a number.`);
    if (!['national', 'province', 'district'].includes(geographyLevel)) throw new Error(`Row ${index + 2}: geography_level must be national, province, or district.`);
    if (read("unit").toLowerCase() === "percent" && (value < 0 || value > 100)) throw new Error(`Row ${index + 2}: percentage must be between 0 and 100.`);
    if (geographyLevel !== "national" && !read("geography_code")) throw new Error(`Row ${index + 2}: non-national rows need geography_code.`);
    return {
      observation_id: read("observation_id"), indicator: read("indicator"), indicator_label: read("indicator_label"), value,
      unit: read("unit"), period_start: dateOrNull(read("period_start")), period_end: dateOrNull(read("period_end")),
      geography_level: geographyLevel, geography_code: dateOrNull(read("geography_code")), geography_name: dateOrNull(read("geography_name")),
      population: read("population"), denominator: read("denominator"), provider_class: dateOrNull(read("provider_class")),
      product: dateOrNull(read("product")), segment_type: dateOrNull(read("segment_type")), segment: dateOrNull(read("segment")),
      table_reference: read("table_reference"), methodology: read("methodology"),
      quality_flags: quality ? quality.split("|").map(clean).filter(Boolean) : [],
      transformation: dateOrNull(read("transformation")),
    };
  });
  if (observations.length > 5000) throw new Error("A file can contain at most 5,000 aggregate rows.");
  const empty = observations.findIndex((row) => REQUIRED.some((key) => !row[key] && key !== "value"));
  if (empty >= 0) throw new Error(`Row ${empty + 2}: complete every required field.`);
  const ids = observations.map((row) => row.observation_id);
  if (new Set(ids).size !== ids.length) throw new Error("Each observation_id must be unique.");
  return observations;
}

export const aggregateCsvTemplate = `${[...REQUIRED, ...OPTIONAL].join(",")}\nexample-2026-national-inclusion,overall_inclusion,Financially included,96.4,percent,,2026-10-19,national,,,Adults,Adults with an active regulated financial service,,,,,BNR dashboard,Provider-reported aggregate,,Published value`;
