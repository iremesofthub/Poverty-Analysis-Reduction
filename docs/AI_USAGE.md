# AI Usage Report

This project was built by the author. AI coding assistants were used as a productivity aid
in four areas only: writing test scripts, improving the logic of the AI engine, producing
Mermaid diagrams, and speeding up debugging. AI did not perform the statistical analysis,
did not choose the methodology, and did not write the findings about poverty or financial
inclusion. Every AI-assisted change was reviewed and tested by the author before being kept.

## 1. Testing — AI helped write test scripts

AI drafted and extended automated tests, and the test harness commands.

| Area | Files AI helped write |
| --- | --- |
| Frontend/JS unit tests (run with `npm test`) | `src/**/*.test.mjs` |
| Investigation API and AI-writer tests | [tools/investigation/ai-writers.test.mjs](../tools/investigation/ai-writers.test.mjs), [tools/investigation/vite-api.test.mjs](../tools/investigation/vite-api.test.mjs) |
| Engine tests (Python `unittest`) | [engine/tests/](../engine/tests) — e.g. `test_agents.py`, `test_gateway.py`, `test_auth.py`, `test_reports_api.py` |
| End-to-end build checks | `npm run e2e` → `tools/e2e/build-isolated.mjs` + Playwright |
| Type and lint gates | `npm run typecheck`, `npm run lint` |
| Docs self-check | [docs/ai-engine-architecture-audit/lint_mermaid.py](ai-engine-architecture-audit/lint_mermaid.py) — validates every Mermaid block parses |

The engine test suite runs 223 tests; results are captured as machine-readable evidence in
[docs/implementation/evidence/verification_run.json](implementation/evidence/verification_run.json).

## 2. AI Engine logic — AI helped improve the design and the code

The product's own AI engine (Ireme Insight) is the part of the codebase where AI assistance
had the most impact, because the author worked through it together with an assistant:

- **Orchestration logic** — bounded research agents, role separation (planner / challenger /
  reviewer), budgets and allowlists: [engine/tests/test_agents.py](../engine/tests/test_agents.py),
  documented in [docs/ai-engine-architecture-audit/04-ai-orchestration.md](ai-engine-architecture-audit/04-ai-orchestration.md).
- **Provider gateway** — multi-key credentials (`GROQ_API_KEY`, `_2`…`_9`) with failover on
  401/403/429, and the key/credit checker `scripts/check_provider_accounts.py`.
- **Chart insight** — prompt and structured-answer logic in
  [supabase/functions/chart-insight/groq.mjs](../supabase/functions/chart-insight/groq.mjs) and the
  dev-mode route in [vite.config.js](../vite.config.js).
- **Investigation tools** — `tools/investigation/ai.py`, `check_ai.py`, `ai-chat.mjs`,
  `ai-notebook.mjs`, `ai-report.mjs`.
- **Audit of weaknesses** — the architecture review that drove the fixes, in
  [docs/ai-engine-architecture-audit/10-architectural-weaknesses.md](ai-engine-architecture-audit/10-architectural-weaknesses.md).

AI proposed refactors and edge cases here; the author decided which ones were correct, and the
engine's statistical behaviour is verified by the tests above rather than accepted on the model's word.

## 3. Mermaid diagrams — AI helped draft and clean up the visuals

Architecture, workflow, lineage and error-handling diagrams were drafted with AI and then
checked with `lint_mermaid.py`. They live in:

- [docs/ai-engine-architecture-audit/](ai-engine-architecture-audit) — `MASTER-ARCHITECTURE.md`
  and modules `01`–`08`
- [docs/DISTRICT_INVESTIGATION.md](DISTRICT_INVESTIGATION.md)

## 4. Debugging — AI automated the slow parts

AI-assisted debugging was used to shorten the find-and-fix loop, not to replace judgement:

- Reading failing test output and locating the responsible file and line
  (e.g. the failures recorded in `docs/implementation/evidence/verification_run.json`).
- Reproducing an issue against a mocked provider instead of a live API call.
- Tracing a request through the dev server, the edge function and the provider gateway.
- Spotting configuration drift, such as non-canonical variable names in `.env.local`
  (caught by `test_local_env_file_uses_canonical_names_only`).

## What AI did not do

- Did not compute or interpret the EICV statistics, poverty rates, or district gaps.
- Did not select or verify the official data sources ([docs/OFFICIAL_SOURCE_REGISTER.md](OFFICIAL_SOURCE_REGISTER.md)).
- Did not author the requests to NISR ([docs/NISR_DATA_REQUEST.md](NISR_DATA_REQUEST.md)).
- Did not approve releases; reviewer signatures and release authorisation remain human steps
  ([engine/ireme/report_service.py](../engine/ireme/report_service.py)).

**Tools used:** Claude Code (recorded as `engine_author` in `docs/implementation/registry.json`)
and the Qoder desktop assistant. Adjust this list if other tools were involved.
**Statement:** the design, the analysis and the conclusions are the author's own work; AI was
an accelerator for tests, engine logic, diagrams, and debugging.
