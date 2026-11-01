import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261031151449_secure_account_access_requests.sql", import.meta.url),
  "utf8",
);

test("account-type requests do not let browser data grant privileged roles", () => {
  assert.match(migration, /requested_role IN \('programme_owner', 'cooperative', 'beneficiary'\)/i);
  assert.match(migration, /Only a newly registered job-applicant profile can submit an access request/i);
  assert.match(migration, /Only a platform administrator can review account requests/i);
  assert.doesNotMatch(migration, /raw_user_meta_data[\s\S]{0,100}role/i);
});

test("member approval links one account to one member record, which USSD also uses", () => {
  assert.match(migration, /SELECT 1 FROM public\.members WHERE id = p_linked_id/i);
  assert.match(migration, /member_id = p_linked_id AND id <> v_request\.user_id/i);
  assert.match(migration, /SET role = 'beneficiary', member_id = p_linked_id/i);
});

test("privileged RPCs authenticate their caller and are not executable by anonymous users", () => {
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_signup_access_request[\s\S]*FROM PUBLIC, anon/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_signup_access_request[\s\S]*TO authenticated/i);
});
