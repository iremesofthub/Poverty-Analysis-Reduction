import { build } from "vite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// UI smoke tests use browser-local demo sessions and must never contact a hosted Supabase project.
process.env.VITE_SUPABASE_URL = "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "";
// They must not depend on a developer's governed API address either: the suites assert the honest
// "no research API in this deployment" state, the same one a reviewer sees from a clean clone.
process.env.VITE_IREME_API_URL = "";

// Clearing the environment is only the first layer. Vite reads `.env.local` from the project root and a
// value found there wins over an empty variable in the environment, which silently produced bundles that
// carried a developer's credentials and put the browser into live-Supabase mode: the demo sessions the
// specs inject are then ignored and every signed-in test lands on the sign-in page. The build is pointed
// at an empty directory instead, so there is no env file to read at all.
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const envDir = mkdtempSync(path.join(tmpdir(), "ireme-e2e-env-"));
mkdirSync(envDir, { recursive: true });
writeFileSync(path.join(envDir, ".gitkeep"), "");

await build({ envDir, logLevel: "warn" });

// Then prove it: any developer value that still appears in the shipped JavaScript fails the build step
// instead of failing a hundred tests later with a misleading "element not found".
const assetDir = path.join(root, "dist", "assets");
const bundles = existsSync(assetDir)
  ? readdirSync(assetDir).filter((file) => file.endsWith(".js")).map((file) => readFileSync(path.join(assetDir, file), "utf8"))
  : [];
const envFile = path.join(root, ".env.local");
const leaked = [];
if (bundles.length && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    const [, name, raw] = match;
    const value = raw.replace(/^["']|["']$/g, "");
    // Only values worth bundling are checked: a bare "1" or "true" would match unrelated code.
    if (value.length > 5 && bundles.some((source) => source.includes(value))) leaked.push(name);
  }
}
if (!bundles.length) throw new Error("Isolated e2e build produced no JavaScript bundle in dist/assets.");
if (leaked.length) {
  throw new Error(`Isolated e2e build still contains developer values in dist: ${leaked.join(", ")}. Not running tests against them.`);
}
console.log("Isolated e2e build verified: no developer VITE_* values in dist/assets.");
