/**
 * The one rule that decides which role a panel check is allowed to trust.
 *
 * Demo mode always works: a demo role stored in localStorage is available
 * whenever it exists, without needing Supabase login. A real Supabase profile
 * role wins if both exist (signed-in user keeps their real role).
 */
export function resolveRole({ supabaseConfigured, profileRole, demoRole }) {
  const candidate = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
  const demo = candidate(demoRole);
  const profile = candidate(profileRole);
  return profile ?? demo;
}
