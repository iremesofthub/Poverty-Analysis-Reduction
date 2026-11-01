import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261030235858_create_signup_profiles.sql", import.meta.url),
  "utf8",
);

test("signup profile migration fixes new accounts to the least-privilege role", () => {
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS private/i);
  assert.match(migration, /REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /'job_applicant'/);
  assert.match(migration, /AFTER INSERT ON auth\.users/i);
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /SET search_path\s*=\s*''/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(migration, /raw_user_meta_data\s*->>\s*'role'/i);
});
