# Ireme Insight Opportunity Platform — Progress

Started: 2026-10-30; updated: 2026-10-31
Latest local verification: 110 npm tests pass; lint and production build pass, with a >500 kB chunk warning. PostgreSQL syntax parsing passed for the signup and phase 1 migrations. Local production-preview browser checks passed for sign-in rendering, protected-route redirect, and public dashboard (3/3) using an isolated build with Supabase credentials removed. The repository owner has made GitHub private; the Pages workflow reports a successful deployment, but the public URL currently returns GitHub Pages 404. No further pushes or visibility changes are authorized while working locally first.

## Status codes
NOT_STARTED, IN_PROGRESS, CODE_COMPLETE, TESTED_LOCAL, TESTED_HOSTED, BLOCKED_EXTERNAL, REVIEWED, RELEASED.

## Phase 0: Baseline & Infrastructure

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| P0-01 | Kit reading + audit | IN_PROGRESS | Mission, current-state map, operating contract, phase tickets and acceptance matrix reviewed; hosted schema metadata/policies inspected read-only; full source and role matrix audit remains. |
| P0-02 | Progress tracking file | CODE_COMPLETE | This file |
| P0-03 | Playwright install + config | TESTED_LOCAL | Separate production-preview suites passed: 3/3 auth/protected-route/public-dashboard, 8/8 Agent Dashboard demo mode, and 1/1 registration form. These isolated bundles do not prove hosted-auth/data behavior. |
| P0-04 | Test baseline verification | IN_PROGRESS | Latest `npm test` 108/108, full lint, and production build pass locally. Engine suite completed 223 tests: 217 passed, 1 failed, 5 skipped. The only failure is a local-only `.env.local` naming check that flags the user-provided Supabase Management token variable; the test source is AI Engine-owned and was not changed. |
| P0-05 | Public site deployment | BLOCKED_EXTERNAL | Pages workflow succeeded at `ec0bb9f`, but current request to the public URL returns GitHub Pages 404. The GitHub repository is private. The user directed local-first work and no visibility change or push. |
| P0-06 | Supabase account role mapping | IN_PROGRESS | Local code reads the signed-in user's `profiles.role`, blocks missing profiles, disables browser demo-role sessions when Supabase is configured, and routes users by database role. A least-privilege signup profile trigger migration is drafted, not applied. No real-account login, row, or RLS test has been performed. |
| P0-07 | Login page refresh | IN_PROGRESS | Local login styling follows the supplied reference and uses email/password through Supabase. Registration now collects a display name and verifies the provisioned profile role after email confirmation. Email is enabled; Google/GitHub OAuth are disabled in the active project, and their buttons only appear when explicitly configured. Successful sign-in still requires staging the migration and testing with a real account. |

## Current audit findings

- Significant operational-platform work is uncommitted. Preserve it; file existence and UI states do not prove backend completion.
- Active Supabase project `ireme-program` (`ywtxpsefbqzmgmdfzldp`) is healthy. Schema, role, selected RLS policies, and Auth URL/provider metadata were inspected read-only. No database migrations or user-data writes were made; draft migrations remain unapplied.
- Job API now targets the migration's `agent_job_applications` table and `posting_id`/`applied_at` keys. The local phase 1 draft was extended to cover the live form fields for vacancies, applications, assessments, slots and contracts. The UI normalizes display aliases at the API boundary. A regression test checks the API/migration contract. This is local code/schema consistency only: the migration remains unapplied and hosted job workflows have not been exercised.
- The programme jobs applicant drawer now loads applications through scoped RLS, displays applicant-provided competency/education/skills, enforces sequential review states, requires a reason for offers/rejections, records assessor rubric scores and pass decisions, schedules an interview with a venue, records interview outcome evidence, and lets the applicant see interview details in their status list. Issuing an offer now writes paid contract terms as an unsigned `offered` contract; the interface explicitly says this does not activate the agent or mark wages paid. Applicant identity is represented by a short application reference in the reviewer UI.
- Recruitment policies now include an explicitly delegated `assessor` membership for assessment reads/writes. Application creation is limited to a published unexpired vacancy and starts in `submitted`; applicants cannot update hiring state. Interview slot policies scope booking and updates to an authorized programme reviewer and require the application to belong to that posting. Contract insert policy binds application, posting and programme and requires an `offered` application.
- The signup migration now creates and locks down its `private` schema before defining the profile trigger, removing an implicit schema prerequisite.
- Job-seeker and programme job screens now show demo rows only when Supabase is unconfigured. When Supabase is configured, query errors and missing programme association are surfaced without substituting demo vacancies.
- AuthContext now reads the user's role from `profiles` and does not trust editable user metadata. Browser demo identities remain only in builds with Supabase unconfigured. Hosted role-specific login still needs verification with a real account and adversarial RLS checks.
- AI Engine implementation remains out of scope under the kit's ownership boundary.
- Latest checks after local recruitment review work: `npm test` passed 110/110; full `npm run lint`, `npm run build`, focused changed-file lint, static schema contract tests and `git diff --check` exited 0; PostgreSQL parser accepts the updated signup and phase 1 migration syntax. The build reports a >500 kB chunk warning. Parser/static tests do not execute migrations or verify policy behavior. Docker is unavailable, so Supabase SQL lint, migration execution, and cross-role RLS tests are NOT_RUN. Targeted earlier browser suites passed 8/8 Agent Dashboard demo-mode, 1/1 registration form, and 3/3 isolated login/protected-route/public dashboard; the new manager review flow has not had a browser test. No check establishes hosted Supabase sign-in or records.
- The first captured browser run against Vite dev completed 22 passed, 16 failed, 1 flaky; several failures were ambiguous locators, and the dev server later refused connections under load.
- Tests were revised to use semantic headings, the actual sidebar labels, a real protected-route redirect wait, and an accessible login error alert. Playwright rebuilds an isolated production bundle with Supabase URL/key blank, then tests Vite preview on a dedicated port. This prevents browser smoke tests from contacting the hosted project.
- After those changes, auth + programme-management tests were 15 passed / 1 failed; the remaining failure was an incorrect “Overview” navigation assertion and is now corrected. The corrected single Overview test passed. The other corrected 15 tests passed in the prior run.
- Read-only Supabase Management API inspection with the user-authorized token confirmed `ireme-program` is active. Public schema contains legacy `agent_applications` (`id`, `agent_id`, `submitted_at`, `status`, `history`) with RLS enabled and only an authenticated SELECT policy. The new opportunity-platform tables are absent. Auth email is enabled, Google/GitHub OAuth are disabled. No hosted records were read and no database writes were issued. A current unauthenticated REST request returned HTTP 401, confirming endpoint reachability only.
- A fresh read-only metadata query verified the legacy `visits` columns, foreign keys, status check (`Scheduled`, `Done`, `Missed`, `Cancelled`), authenticated SELECT/UPDATE privileges, `visits_read` scope policy, and `visits_agent_update` agent-owned UPDATE policy. No INSERT policy exists. AgentDashboard and `fieldApi.js` now read today's visits for the signed-in profile's `agent_id`, count current assignments, and update only the assigned visit's status to `Done`, with both visit ID and agent ID filters. The form discloses that narrative notes/outcome fields are not stored. These local changes have not been tested with a real authenticated agent account; no database row was accessed or changed.
- The hosted project has no `auth.users` insert trigger. `profiles.role` is a required `app_role` with the database default `job_applicant`; the enum includes that value. A local CLI-generated migration adds a private-schema `SECURITY DEFINER` trigger function with fixed empty `search_path`, revokes direct execution from public client roles, creates only a least-privilege profile, and reads user metadata for display name/language only. Registration now collects the name and checks the resulting profile before routing. Migration is un-applied; there is no local Postgres/Supabase instance in this workspace, so trigger execution and verified sign-up remain NOT_RUN.

## Phase status

| Phase | Status | Evidence / next gate |
|------|--------|----------------------|
| 0 Baseline | IN_PROGRESS | Public page crash fix is in the last successful Pages artifact, but the current private-repository Pages URL is 404. Local checks pass; auth and schema gates remain. |
| 1 Jobs and recruitment | IN_PROGRESS | Local APIs, reviewer UI, staged assessment/interview decisions, contract offer insert and draft RLS now share a schema contract; hosted schema has only legacy `agent_applications`. Safe staging migration, adversarial RLS, browser workflow, offer acceptance, agent entitlement/induction and payroll remain open. |
| 2 Field activities | IN_PROGRESS | Agent dashboard now connects read/status-update paths to existing `visits` and `agent_assignments` under hosted RLS. Narrative journals, training plans, evidence storage, consent, supervisor verification and authenticated-role integration tests remain unimplemented/unverified. |
| 3 Finance | IN_PROGRESS | Draft schema/hooks/UI changes exist; no external payment provider; persistence/reconciliation unverified. |
| 4 Cooperatives | NOT_STARTED | Acceptance scenarios unverified. |
| 5 Government/actions | IN_PROGRESS | Draft schema/integration exist; cross-session and aggregate privacy tests unverified. |
| 6 Full acceptance | NOT_STARTED | All acceptance-matrix rows remain NOT_RUN absent captured evidence. |

## Known blockers

| ID | Description | Status |
|----|-------------|--------|
| BLK-SCHEMA | Active `ireme-program` lacks new operational objects; no isolated staging project is configured. Do not apply the draft migrations to production without explicit migration authorization and staging verification. | BLOCKED_EXTERNAL |
| BLK-RLS | New policy drafts have not had adversarial cross-role execution tests. | IN_PROGRESS |
| BLK-E2E | Playwright config/specs exist but end-to-end browser scenarios are not run. | IN_PROGRESS |
| BLK-PAYMENT | No contracted payment provider; never claim a transfer settled. | BLOCKED_EXTERNAL |

## Acceptance status

`Ireme_Insight_Opportunity_Platform_Kit_2026-10-30/QA/ACCEPTANCE_MATRIX.csv` remains authoritative. Scenarios are NOT_RUN unless an evidence artifact and command result are recorded. No hosted deployment or database test is claimed.
