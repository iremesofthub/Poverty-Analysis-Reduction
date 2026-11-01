/**
 * src/lib/hackathonDemo.test.mjs
 *
 * The rule that decides when a browser-stored panel role may open a panel on a build that really is
 * connected to Supabase. Two things had to stay true at once: judges can browse the published statistics
 * without an account, and nobody can reach an upload, an approval or a household record that way. These
 * cases hold the boundary offline — no router, no database, no environment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEMO_PANEL_DENYLIST, DEMO_PANEL_ROUTES, demoPanelOpen, isHostedDemoSession } from "./hackathonDemo.js";

const open = (overrides) => demoPanelOpen({
  flagEnabled: true,
  demoRole: "nisr_analyst",
  pathname: "/financial-inclusion",
  isAuthenticated: false,
  ...overrides,
});

describe("the hackathon demo switch, when it may answer for a signed-in account", () => {
  it("opens a published-statistics panel once the switch is on", () => {
    for (const route of DEMO_PANEL_ROUTES) {
      assert.equal(open({ pathname: route }), true, `${route} is meant to be browsable in demo mode`);
    }
  });

  it("stays closed entirely when the switch is off", () => {
    for (const route of DEMO_PANEL_ROUTES) {
      assert.equal(open({ flagEnabled: false, pathname: route }), false, `${route} needs a session without the switch`);
    }
  });

  it("keeps every writing, approving and household panel closed", () => {
    for (const route of DEMO_PANEL_DENYLIST) {
      assert.equal(open({ pathname: route, demoRole: "platform_admin" }), false, `${route} must never open on a stored role`);
    }
  });

  it("refuses a route it has not been told about", () => {
    for (const route of ["/investigations", "/profile", "/data-upload/confirm", "", "/financial-inclusion/extra"]) {
      assert.equal(open({ pathname: route }), false, `${JSON.stringify(route)} is not on the allowlist`);
    }
  });

  it("lets a signed-in session decide for itself", () => {
    assert.equal(open({ isAuthenticated: true }), false, "an authenticated visitor is not routed through the demo branch");
  });

  it("refuses when no usable demo role is stored", () => {
    for (const junk of [null, undefined, "", "   ", 0, false, [], {}, "  "]) {
      assert.equal(open({ demoRole: junk }), false, `a stored role of ${JSON.stringify(junk)} opens nothing`);
    }
  });

  it("trims a padded role instead of treating it as missing", () => {
    assert.equal(open({ demoRole: "  nisr_analyst  " }), true);
  });

  it("lists no route twice and no route on both sides", () => {
    const overlap = DEMO_PANEL_ROUTES.filter((route) => DEMO_PANEL_DENYLIST.includes(route));
    assert.deepEqual(overlap, [], "a panel cannot be both open to judges and closed to them");
    assert.equal(new Set(DEMO_PANEL_ROUTES).size, DEMO_PANEL_ROUTES.length, "the allowlist has no duplicates");
  });

  it("keeps the data-upload and account-approval panels out of the allowlist", () => {
    // The two panels that can change published figures or grant roles, named here so a future
    // "just add the whole Analysis group" edit has to pass this assertion on purpose.
    for (const route of ["/data-upload", "/account-requests", "/ussd-control", "/evidence"]) {
      assert.equal(DEMO_PANEL_ROUTES.includes(route), false, `${route} writes to the governed database`);
    }
  });
});

describe("labelling a hosted demo session", () => {
  it("labels only a configured deployment browsing on a stored role", () => {
    const base = { flagEnabled: true, supabaseConfigured: true, demoUser: { role: "nisr_analyst" }, isAuthenticated: false };
    assert.equal(isHostedDemoSession(base), true);
    assert.equal(isHostedDemoSession({ ...base, flagEnabled: false }), false, "no switch, no demo claim");
    assert.equal(isHostedDemoSession({ ...base, supabaseConfigured: false }), false, "a local preview is not a hosted demo");
    assert.equal(isHostedDemoSession({ ...base, demoUser: null }), false, "a signed-in account is not a demo");
    assert.equal(isHostedDemoSession({ ...base, isAuthenticated: true }), false, "a real session is not a demo");
  });
});
