// UPG-12 registry contract tests. Run with `npm test` (node --test). These checks exist so the discoverability
// layer cannot drift from the router, the pages or the honesty rules without a failing test.
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AI_ENGINE_SECTIONS,
  ANALYST_DASHBOARD_FEATURES,
  JUDGE_FEATURE_IDS,
  ROUTE_ACCESS,
  ROUTE_TABS,
  featureById,
  isKnownHref,
  judgeTour,
  resolveFeature,
  routeAllows,
} from "./judgeFeatureRegistry.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const source = (relative) => readFileSync(path.join(root, relative), "utf8");
const english = JSON.parse(source("src/i18n/en.json"));
const kinyarwanda = JSON.parse(source("src/i18n/rw.json"));
const contract = JSON.parse(source("CODEX_IREME_UPGRADE/02_CONTRACTS/JUDGE_FEATURE_REGISTRY.json"));

const copyFor = (id) => english.discover.feature[id];

test("the registry covers every feature the planning contract names", () => {
  assert.deepEqual([...JUDGE_FEATURE_IDS].sort(), [...contract.required_primary_ids, ...contract.features.map((item) => item.id)].filter((id, index, all) => all.indexOf(id) === index).sort());
  assert.deepEqual([...ANALYST_DASHBOARD_FEATURES], contract.required_primary_ids);
});

test("the guard table matches the routes the application actually declares", () => {
  // Each `<Route element={<RoleGuard roles={[...]} />}>` block in App.jsx lists the roles for the paths inside it.
  const app = source("src/App.jsx");
  const blocks = [...app.matchAll(/RoleGuard roles=\{\[([^\]]*)\]\} \/>\}\s*>([\s\S]*?)<\/Route>/g)];
  assert.ok(blocks.length > 5, "expected several guarded route blocks in App.jsx");
  for (const [, roleList, body] of blocks) {
    const roles = [...roleList.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    for (const [, route] of [...body.matchAll(/<Route path="([^"]+)" element=/g)]) {
      assert.ok(ROUTE_ACCESS[route], `${route} is routed but missing from the registry guard table`);
      assert.deepEqual([...ROUTE_ACCESS[route]].sort(), [...roles].sort(), `${route}: registry roles differ from RoleGuard`);
    }
  }
});

test("the tab table matches the sub-navigation each page really accepts", () => {
  const programme = source("src/data/programme.js");
  const pmTabs = [...programme.matchAll(/\{ id: "([a-z]+)", label:/g)].map((match) => match[1]);
  assert.deepEqual(ROUTE_TABS["/programmes"], pmTabs);
  const gov = source("src/lib/govArea.js");
  assert.deepEqual(ROUTE_TABS["/government"], [...gov.matchAll(/\{ id: "([a-z]+)", label:/g)].map((match) => match[1]));
  const member = source("src/lib/memberTabs.js");
  assert.deepEqual(ROUTE_TABS["/beneficiary"], [...member.matchAll(/\{ id: "([a-z]+)", label:/g)].map((match) => match[1]));
  const engine = source("src/pages/AIEngine.jsx");
  const sections = [...engine.matchAll(/\{ id: "([a-z]+)", label: "[^"]+", icon:/g)].map((match) => match[1]);
  assert.deepEqual(AI_ENGINE_SECTIONS, sections);
});

test("every declared destination is a real route with a real tab or section", () => {
  for (const id of JUDGE_FEATURE_IDS) {
    const feature = featureById(id);
    assert.ok(feature, `${id} missing`);
    const entries = Object.entries(feature.destinations);
    for (const [role, entry] of entries) {
      assert.ok(isKnownHref(entry.href), `${id}: ${entry.href} is not a known route`);
      if (role !== "default") assert.ok(routeAllows(role, entry.href), `${id}: ${role} cannot reach ${entry.href}`);
    }
    for (const proof of feature.proof) assert.ok(isKnownHref(proof.href), `${id}: proof link ${proof.href} is not a known route`);
  }
});

test("invalid tabs, sections, routes and anchors are refused rather than linked to", () => {
  assert.equal(isKnownHref("/programmes?tab=magic"), false);
  assert.equal(isKnownHref("/ai-engine?section=magic"), false);
  assert.equal(isKnownHref("/nonexistent"), false);
  assert.equal(isKnownHref("/other-analysis#nowhere"), false);
  assert.equal(isKnownHref("/map"), true);
});

test("a card never offers a screen the guard would refuse", () => {
  // The national analyst has no programme panel, so the action card must resolve to the analyst's own delivery view.
  const analyst = resolveFeature("action-tracking", "nisr_analyst");
  assert.equal(analyst.available, true);
  assert.equal(analyst.href, "/other-analysis#programme-delivery");
  assert.equal(routeAllows("nisr_analyst", "/programmes"), false);
  assert.equal(routeAllows("nisr_analyst", "/evidence"), false);
  assert.equal(routeAllows("beneficiary", "/programmes"), false);
  assert.equal(routeAllows("field_agent", "/datasets"), false);
  // A role with no compliant screen gets a reason, not a redirect.
  const applicant = resolveFeature("action-tracking", "job_applicant");
  assert.equal(applicant.available, false);
  assert.ok(english.discover.blocked[applicant.reason.replace("discover.blocked.", "")], "unavailable state needs an explanation");
});

test("the four dashboard cards resolve for both roles that own the dashboard", () => {
  for (const role of ["platform_admin", "nisr_analyst"]) {
    const resolved = ANALYST_DASHBOARD_FEATURES.map((id) => resolveFeature(id, role));
    assert.equal(resolved.filter((item) => item.available).length, 4, `${role} should see four live cards`);
    for (const item of resolved) assert.ok(routeAllows(role, item.href));
  }
});

test("no capability is described as verified, certified or live in its own words", () => {
  const claims = [/production[- ]ready/i, /real[- ]world impact/i, /\b(is|are|now|fully|independently)\s+(verified|certified)\b/i, /certified by\b/i, /\bproven (impact|result)/i];
  const bodies = [];
  for (const id of JUDGE_FEATURE_IDS) {
    const text = copyFor(id);
    assert.ok(text?.title && text.subtitle && text.cta, `${id}: missing card copy`);
    for (const field of ["purpose", "source", "systemState", "limitation"]) {
      assert.ok(text[field], `${id}: evidence panel needs a ${field}`);
      bodies.push(`${id}.${field}: ${text[field]}`);
    }
    // A feature that is not finished must say what is missing, in the present tense.
    assert.match(`${text.systemState} ${text.limitation}`.toLowerCase(), /not|no |pending|outstanding|missing|until|demonstration|sample/, `${id}: states what is missing`);
  }
  for (const body of bodies) {
    for (const pattern of claims) assert.doesNotMatch(body, pattern, `${body} claims more than the build delivers`);
  }
  for (const label of Object.values(english.discover.state)) assert.doesNotMatch(label, /verified|certified|production/i);
  // The Kinyarwanda state chips must not promise more than the English ones either.
  for (const label of Object.values(kinyarwanda.discover.state)) assert.doesNotMatch(label, /verified|certified|production/i);
});

test("the browser registry carries no credential, private path or personal record", () => {
  const registrySource = source("src/lib/judgeFeatureRegistry.js");
  // Both languages are scanned: a translated card must not become less honest than the English one.
  const discoverCopy = [english.discover, kinyarwanda.discover].map((block) => JSON.stringify(block ?? {}));
  // Credential-shaped text (an actual `password:`/`password=` value), not the
  // word inside a comment that explains why none may appear here.
  const banned = [/Demo@2026/, /@[\w.-]+\.(demo|com|rw)/i, /\.dta\b/, /Cross_Section/i, /password["']?\s*[:=]/i, /\b07\d{8}\b/, /\bNID\b\s*\d/];
  for (const copy of discoverCopy) {
    for (const pattern of banned) {
      assert.doesNotMatch(registrySource, pattern, `registry source holds ${pattern}`);
      assert.doesNotMatch(copy, pattern, `discover copy holds ${pattern}`);
    }
  }
  // No counts or money amounts on the cards: figures stay where their source and interval live.
  // Survey years (2023/24) and the "95%" confidence level are part of naming a source, not a
  // result, so the scan looks for grouped thousands, long digit runs and any digit that claims
  // to count people, households or records.
  for (const copy of discoverCopy) {
    assert.doesNotMatch(copy, /\b\d{1,3}(,\d{3})+\b/, "discovery copy should not carry unlabelled totals");
    assert.doesNotMatch(copy, /\b\d{5,}\b/, "discovery copy should not carry large figures");
    assert.doesNotMatch(copy, /\b\d[\d.,]*\s+(households|people|persons|records|requests|villages|sectors|districts)\b/i, "discovery copy should not count anything");
  }
});

test("the judge walkthrough has five steps and only visits screens the role can open", () => {
  for (const role of Object.keys(ROUTE_ACCESS["/settings"])) {
    const steps = judgeTour(role);
    assert.equal(steps.length, 5, `${role}: five durable steps`);
    assert.deepEqual(steps.map((item) => item.id), ["problem", "evidence", "compare", "action", "report"]);
    for (const step of steps) {
      assert.ok(step.anchor, `${role}/${step.id}: steps point at a stable marker`);
      if (step.available) {
        assert.ok(isKnownHref(step.href), `${role}/${step.id}: ${step.href} is not routable`);
        assert.ok(routeAllows(role, step.href), `${role}/${step.id}: guard would refuse ${step.href}`);
      } else {
        assert.equal(step.href, null);
      }
      const text = step.id === "action" && role === "nisr_analyst"
        ? english.discover.tour.actionAnalyst.text
        : english.discover.tour[step.id].text;
      assert.ok(text.length > 40, `${step.id}: step explains itself`);
    }
  }
});

test("every walkthrough anchor is a marker a component really renders", () => {
  // The walkthrough finds each step with `document.querySelector('[data-judge="<anchor>"]')`. A marker that no
  // component renders would make the tour navigate to a screen and then admit it showed nothing, so the anchor
  // names are checked against the source instead of trusted.
  const rendered = ["src/components", "src/pages"];
  const files = rendered.flatMap((folder) => readdirSync(path.join(root, folder), { recursive: true })
    .filter((entry) => String(entry).endsWith(".jsx"))
    .map((entry) => source(path.join(folder, String(entry)))));
  const markers = new Set();
  for (const text of files) {
    for (const match of text.matchAll(/data-judge="([\w-]+)"/g)) markers.add(match[1]);
    // A FeatureMiniEntry section names its marker through the `anchor` prop, which becomes data-judge at runtime.
    for (const match of text.matchAll(/anchor="([\w-]+)"/g)) markers.add(match[1]);
  }
  assert.ok(markers.size > 8, "expected several stable judge markers in the interface");
  for (const role of Object.keys(ROUTE_ACCESS["/settings"])) {
    for (const step of judgeTour(role)) {
      if (step.available) {
        assert.ok(markers.has(step.anchor), `${role}/${step.id}: nothing renders data-judge for "${step.anchor}"`);
      }
    }
  }
});

test("a role with a thin panel gets an explanation for the steps it cannot open", () => {
  // The AI Engine workspace is reserved for the analysts and the platform admin, so the narrowest role
  // can follow no walkthrough step and each step must explain why instead of linking somewhere refused.
  const steps = judgeTour("job_applicant");
  assert.deepEqual(steps.filter((item) => item.available).map((item) => item.id), []);
  const unavailable = steps.filter((item) => !item.available);
  assert.equal(unavailable.length, 5);
  for (const step of unavailable) assert.equal(step.href, null);
  assert.ok(english.discover.tour.unavailable.text.includes("{{reason}}"));
  assert.ok(english.discover.tour.unavailable.text.includes("{{summary}}"));
});
