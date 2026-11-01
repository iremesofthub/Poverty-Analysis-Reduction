import test from "node:test";
import assert from "node:assert/strict";
import { readAggregateCsv } from "./financialDatasetUpload.js";

const valid = "observation_id,indicator,indicator_label,value,unit,period_end,geography_level,population,denominator,table_reference,methodology\na,coverage,Coverage,96.4,percent,2026-10-19,national,Adults,Adults,BNR,Provider report";

test("reads a valid aggregate financial-inclusion CSV", () => {
  assert.equal(readAggregateCsv(valid)[0].value, 96.4);
});

test("refuses missing provenance columns and invalid percentages", () => {
  assert.throws(() => readAggregateCsv("observation_id,value\na,99"), /Missing required/);
  assert.throws(() => readAggregateCsv(valid.replace("96.4", "101")), /between 0 and 100/);
});
