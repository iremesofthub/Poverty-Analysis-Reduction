export const SIGNUP_ACCOUNT_TYPES = [
  { value: "job_applicant", label: "Job Applicant", help: "Apply for field-agent and programme jobs." },
  { value: "programme_owner", label: "Programme Account", help: "Request an account for a social-support programme." },
  { value: "cooperative", label: "Cooperative", help: "Request an account for a registered cooperative." },
  { value: "beneficiary", label: "Program Member", help: "Request access to your own programme-member record and USSD number." },
];

export function validateSignupIntent(intent) {
  const accountType = intent.accountType || "job_applicant";
  if (!SIGNUP_ACCOUNT_TYPES.some((item) => item.value === accountType)) throw new Error("Choose a valid account type.");
  if (accountType === "job_applicant") return { accountType };

  const phone = String(intent.phone || "").replace(/[^\d+]/g, "");
  if (!phone) throw new Error("Enter the phone number that the programme has on record.");
  if (accountType === "programme_owner" && String(intent.organisationName || "").trim().length < 2) throw new Error("Enter the organisation or programme name.");
  if (accountType === "cooperative" && String(intent.organisationName || "").trim().length < 2) throw new Error("Enter the cooperative name.");
  return { accountType, phone, organisationName: String(intent.organisationName || "").trim().slice(0, 120), reference: String(intent.reference || "").trim().slice(0, 80) };
}
