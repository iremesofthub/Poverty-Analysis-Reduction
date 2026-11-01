import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiUrl = new URL("../../src/lib/jobsApi.js", import.meta.url);
const migrationUrl = new URL("../../supabase/migrations/20261031001029_opportunity_platform_phase1.sql", import.meta.url);
const [api, migration] = await Promise.all([
  readFile(apiUrl, "utf8"),
  readFile(migrationUrl, "utf8"),
]);

test("jobs API uses the table and key names defined by the phase 1 migration", () => {
  assert.match(api, /\.from\("agent_job_postings"\)/);
  assert.match(api, /\.from\("agent_job_applications"\)/);
  assert.match(api, /\.from\("candidate_assessments"\)/);
  assert.match(api, /\.from\("interview_slots"\)/);
  assert.match(api, /\.from\("agent_contracts"\)/);
  assert.doesNotMatch(api, /\.from\("job_applications"\)/);
  assert.match(api, /posting_id/);
  assert.match(api, /applied_at/);
});

test("phase 1 migration contains columns selected or written by the jobs API", () => {
  const requiredColumns = [
    "employment_type", "salary_min", "salary_max", "salary_currency",
    "district_code", "location_description", "required_skills",
    "application_deadline", "exam_time", "interview_time", "positions_count",
    "cover_note", "education_institution", "education_field", "education_grad_year",
    "work_experience_years", "skills_self_reported", "decision_rationale",
    "score", "passed", "assessor_id", "slot_start", "job_id",
  ];
  for (const column of requiredColumns) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `missing migration column: ${column}`);
  }
  assert.match(migration, /applicant_user_id uuid NOT NULL REFERENCES public\.profiles\(id\)/);
  assert.match(migration, /status = 'published'/);
  assert.match(migration, /status = 'submitted'/);
  assert.match(migration, /CREATE POLICY "applications_update_hr"[\s\S]*FOR UPDATE TO authenticated/);
  assert.match(migration, /CREATE POLICY "slots_update_hr"[\s\S]*FOR UPDATE TO authenticated/);
  assert.match(migration, /delegated_role IN \('org_admin','hr','recruiter','assessor','field_supervisor'/);
  assert.match(migration, /assessed_by = auth\.uid\(\)[\s\S]*delegated_role IN \('org_admin','hr','recruiter','assessor','programme_manager'\)/);
  assert.match(migration, /CONSTRAINT application_decision_reason_check CHECK[\s\S]*status NOT IN \('offered','rejected'\)/);
  assert.match(migration, /interviewer_user_id = auth\.uid\(\)[\s\S]*ajp\.id = interview_slots\.job_id/);
  assert.match(migration, /aja\.posting_id = interview_slots\.job_id/);
});
