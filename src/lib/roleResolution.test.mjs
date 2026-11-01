/**
 * src/lib/roleResolution.test.mjs
 *
 * The rule that says which role a panel check may trust. Demo mode always works:
 * a demo role stored in localStorage is available whenever it exists, without
 * needing Supabase login. A real Supabase profile role wins if both exist
 * (signed-in user keeps their real role).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveRole } from "./roleResolution.js";

describe("which role a panel check is allowed to trust", () => {
  it("accepts a demo role even when Supabase is configured", () => {
    assert.equal(
      resolveRole({ supabaseConfigured: true, profileRole: null, demoRole: "platform_admin" }),
      "platform_admin",
      "demo role opens the panel without Supabase login",
    );
  });

  it("prefers the signed-in profile over a stored demo role", () => {
    assert.equal(
      resolveRole({ supabaseConfigured: true, profileRole: "gov_district", demoRole: "platform_admin" }),
      "gov_district",
      "the profile row wins; the demo value does not outrank a real profile",
    );
  });

  it("accepts a demo role in a local preview where no database exists", () => {
    assert.equal(
      resolveRole({ supabaseConfigured: false, profileRole: null, demoRole: "nisr_analyst" }),
      "nisr_analyst",
      "the hackathon demo still opens without Supabase credentials",
    );
  });

  it("returns null, not a stray value, when neither slot carries a role", () => {
    for (const junk of [undefined, "", "   ", 0, false, [], {}, "  ", Number.NaN]) {
      assert.equal(
        resolveRole({ supabaseConfigured: true, profileRole: junk, demoRole: junk }),
        null,
        `when both slots are ${JSON.stringify(junk)}, there is no role to hand out`,
      );
      assert.equal(
        resolveRole({ supabaseConfigured: false, profileRole: junk, demoRole: junk }),
        null,
        `a preview build with ${JSON.stringify(junk)} in both slots has no role to hand out`,
      );
    }
  });

  it("prefers profile over demo when a profile exists", () => {
    assert.equal(
      resolveRole({ supabaseConfigured: false, profileRole: "gov_district", demoRole: "platform_admin" }),
      "gov_district",
      "profile outranks demo in both branches",
    );
  });

  it("trims surrounding space so a padded role is not mistaken for a different one", () => {
    assert.equal(
      resolveRole({ supabaseConfigured: false, profileRole: null, demoRole: "  programme_owner  " }),
      "programme_owner",
      "the role is normalised before it is returned",
    );
  });
});
