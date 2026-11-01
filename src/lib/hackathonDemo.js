/**
 * The single place the hackathon demo switch is read.
 *
 * `VITE_HACKATHON_DEMO=true` lets a browser-stored demo role open a fixed set of read-only,
 * public-figure panels on a build that has Supabase configured. The login page panel buttons
 * no longer depend on it: they always sign in for real with the competition accounts.
 * It is a deployment-time switch: no tracked file in this repository turns it on (see
 * `hackathonDemoFlag.test.mjs`), so a checkout that forgets the variable stays fail-closed
 * and every hosted panel keeps requiring a signed-in session.
 *
 * The allowlist is deliberately short and named here rather than spread across routes. Panels that write
 * to the governed database, hold household or programme records, or approve uploads are absent on purpose:
 * a visitor browsing on a demo role must not be able to publish a dataset or read a beneficiary.
 */

// Panels that only present published statistics, so an unauthenticated visitor may browse them in demo mode.
// The AI Engine is not here: it is a governed workspace reserved for the analysts and the platform admin.
export const DEMO_PANEL_ROUTES = ["/", "/other-analysis", "/nst2", "/financial-inclusion", "/datasets", "/map"];

// Panels that must never open for a demo visitor, asserted against the allowlist in `hackathonDemo.test.mjs`.
export const DEMO_PANEL_DENYLIST = [
  "/data-upload",
  "/account-requests",
  "/ussd-control",
  "/evidence",
  "/programmes",
  "/cooperative",
  "/cooperatives",
  "/government",
  "/agent",
  "/beneficiary",
  "/jobs",
  "/settings",
];

// Read with `?.` so the module still loads under `node --test`, where Vite has not injected `import.meta.env`.
export const hackathonDemoEnabled = String(import.meta.env?.VITE_HACKATHON_DEMO ?? "").trim().toLowerCase() === "true";

/**
 * Decide whether this navigation may be answered by a browser-stored demo role.
 *
 * Every input is passed in, so the rule is testable without a router, a database or an environment.
 * A signed-in account never takes this branch: its own profile role decides, and this returns false.
 */
export function demoPanelOpen({ flagEnabled, demoRole, pathname, isAuthenticated }) {
  if (!flagEnabled) return false;
  if (isAuthenticated) return false;
  if (typeof demoRole !== "string" || !demoRole.trim()) return false;
  return DEMO_PANEL_ROUTES.includes(pathname);
}

/**
 * True when the visitor is browsing a configured deployment on a demo role alone. The shell uses it to
 * label the screen, so nobody mistakes a demonstration session for an authenticated one.
 */
export function isHostedDemoSession({ flagEnabled, supabaseConfigured, demoUser, isAuthenticated }) {
  return Boolean(flagEnabled && supabaseConfigured && demoUser && !isAuthenticated);
}
