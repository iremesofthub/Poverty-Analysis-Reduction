import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createI18n as create } from "./core.js";
import { formatDate, formatMoney, formatNumber } from "../lib/format.js";
import tourRw from "./tourRw.js";

const load = (name) => JSON.parse(readFileSync(new URL(`./${name}.json`, import.meta.url), "utf8"));
const en = load("en");
const rw = load("rw");
const createI18n = (language) => create({ en, rw: structuredClone(rw) }, language);

test("Kinyarwanda uses translated core labels and falls back for pending copy", () => {
  const i18n = createI18n("rw");
  assert.equal(i18n.t("settings.title"), "Igenamiterere");
  assert.equal(i18n.t("tour.stepOf", { current: 2, total: 5 }), "Intambwe 2 kuri 5");
});

test("a translated Kinyarwanda key is used, and switching language is immediate", async () => {
  const i18n = createI18n("en");
  assert.equal(i18n.t("settings.title"), "Settings");
  await i18n.changeLanguage("rw");
  assert.equal(i18n.t("settings.title"), "Igenamiterere");
});

test("a missing key shows the key rather than crashing", () => {
  assert.equal(createI18n("en").t("nope.nothing"), "nope.nothing");
});

test("rw.json carries the same translation structure as English", () => {
  const walk = (tree) => Object.values(tree).flatMap((v) => (v && typeof v === "object" ? walk(v) : [v]));
  assert.ok(walk(rw).length > 50);
  assert.equal(Object.keys(rw).sort().join(","), Object.keys(en).sort().join(","));
});

test("every guided-tour step has Kinyarwanda copy", () => {
  for (const [id, copy] of Object.entries(tourRw)) {
    assert.ok(copy.title.trim(), `${id} title is empty`);
    assert.ok(copy.text.trim(), `${id} text is empty`);
  }
});

test("money, numbers and dates follow the language and never throw", () => {
  assert.match(formatMoney(12500, "en"), /^RWF 12,500$/);
  assert.ok(formatMoney(12500, "rw").startsWith("RWF "));
  assert.equal(formatMoney("x", "en"), "—");
  assert.equal(formatNumber(1234.5, "en"), "1,234.5");
  assert.match(formatDate("2026-11-05T10:00:00Z", "en"), /5 Nov 2026|Nov 5, 2026/);
  assert.equal(formatDate("not a date", "rw"), "—");
});
