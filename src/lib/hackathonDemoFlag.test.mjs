/**
 * src/lib/hackathonDemoFlag.test.mjs
 *
 * `roleResolution.js` honours one build-time switch: with `VITE_HACKATHON_DEMO=true` a browser-stored role
 * is consulted even in a deployment where Supabase is configured. Off — which is what every file in this
 * repository sets — the switch changes nothing and the fail-closed rule holds. That makes the flag the
 * single place where `03_TESTS/ROLE_NEGATIVE_TESTS.md` 12 ("demo administrator toggles are unavailable
 * under `GOVERNED_PRODUCTION`") could be quietly reversed: one line in a hosted build config, and the login
 * page's panel buttons start granting panels to anonymous visitors.
 *
 * So the guard is a source check rather than a runtime one: no tracked build or deployment file may turn
 * it on. The values of `.env.local` are never read here — the file is developer-local, not a deployment
 * input, and printing or asserting against its contents would put it in test output (contrast the standing
 * rule about that file, and `engine/tests/test_gateway.py::MultiKeyCredentials`, which compares key names
 * only).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

// Every tracked file that can supply a build-time environment value to a hosted or tested bundle.
const DEPLOYMENT_FILES = [
  "vercel.json",
  "package.json",
  ".env.example",
  "engine/fly.toml",
  "engine/render.yaml",
  "tools/e2e/build-isolated.mjs",
  "tools/investigation/browser-render.mjs",
];

describe("the hackathon demo role switch stays off in every buildable configuration", () => {
  for (const relative of DEPLOYMENT_FILES) {
    it(`${relative} does not enable VITE_HACKATHON_DEMO`, () => {
      let text;
      try {
        text = readFileSync(new URL(relative, ROOT), "utf8");
      } catch {
        // A checkout without that deployment target (no Fly.io config on a Vercel-only branch) cannot be
        // enabling anything, so absence passes and the listed files that do exist are still proven.
        return;
      }
      const enabled = /^\s*[^\n#]*VITE_HACKATHON_DEMO["']?\s*[:=]\s*["']?true["']?/im.exec(text);
      assert.equal(
        enabled,
        null,
        `${relative} turns on the flag that lets a localStorage role answer for a signed-in one. ` +
          "Panels for a hosted build must come from the profile row and the verified bearer token.",
      );
    });
  }
});
