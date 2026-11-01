import test from "node:test";
import assert from "node:assert/strict";
import { validateSignupIntent } from "./signupIntent.js";

test("job applicants can register without a staff-access request", () => {
  assert.deepEqual(validateSignupIntent({ accountType: "job_applicant" }), { accountType: "job_applicant" });
});

test("programme, cooperative and member requests need the phone held by the programme", () => {
  for (const accountType of ["programme_owner", "cooperative", "beneficiary"]) {
    assert.throws(() => validateSignupIntent({ accountType }), /phone number/i);
  }
});

test("a requested role is validated but never turned into an approved role in the browser", () => {
  const value = validateSignupIntent({ accountType: "beneficiary", phone: "0788123456", reference: "MEM-21" });
  assert.equal(value.accountType, "beneficiary");
  assert.equal(value.phone, "0788123456");
  assert.equal(Object.hasOwn(value, "role"), false);
});
