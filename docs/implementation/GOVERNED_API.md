# Governed API integration status

The FastAPI read boundary in `engine/ireme/api.py` reads durable scientific-run
records from the catalog. It verifies JWT signatures and trusted issuer/audience,
then enforces signed server-managed tenant, role and geography scopes, dataset
permission, and run ownership/reviewer access. Uncertified estimates are not
returned through `/facts`. Permission revocation is checked on every request.

Implemented routes:

- `GET /v1/investigations/{id}?district=Kamonyi`: restricted status, manifest and scoped diagnostic differences.
- `GET /v1/investigations/{id}/lineage`: permitted backward lineage.
- `GET /v1/investigations/{id}/facts`: denies pending independent scientific certification.
- `GET|POST /v1/investigations/{id}/hypotheses?district=...`: immutable hypothesis ledger revisions.
- `POST /v1/investigations/{id}/agent-proposals?district=...`: one bounded research-agent task
  (role, question, step/repair budget). Requires the creation permission, a configured provider
  gateway and (for remote providers) `IREME_AGENT_CLEARANCE`. Returns typed proposals with
  `requires_human_review=true`; it never appends to the ledger, certifies a fact or approves a
  release. The run is journalled as a redacted `agent.run` audit event.
- `POST /v1/reports/{id}/review`: one `aal2` reviewer records an approve/reject decision on a frozen
  report version. The body is `{version, decision, report_ast_sha256, reason}`: the reviewer must
  name the AST hash they reviewed, and a changed or stale snapshot is refused with `409
  REPORT_CHANGED` before any signature is recorded. The three required roles (statistical, privacy,
  release) must each sign; the route never accepts client-supplied checks, signatures or status, and
  the author cannot sign.
- `POST /v1/reports/{id}/publish`: the publication authority publishes an approved version and
  supersedes the previous one.
- `GET /v1/reports/{id}/export?version=&format=pdf|html|xlsx|json`: the only path to report bytes.
  Draft, QA-failed, superseded and revoked versions are refused (`NOT_RELEASED`, `SUPERSEDED`,
  `REVOKED`) and the attempt is audited; released artifacts are re-checked against the frozen AST
  hash on every request, and `json` returns the canonical frozen AST.

Every route, including unknown paths, requires bearer authentication. Responses
are non-cacheable; failures use structured codes and trace IDs without token echo.
Read audit events are persisted. These component tests use ephemeral test signing
authorities; they do not establish hosted identity-provider readiness.

Backend configuration (no API secrets in browser code):

```
IREME_AUTH_ISSUER=https://YOUR-PROJECT.supabase.co/auth/v1
IREME_AUTH_AUDIENCE=authenticated
IREME_JWKS_URL=https://YOUR-PROJECT.supabase.co/auth/v1/.well-known/jwks.json
IREME_CATALOG_DB=PATH_TO_GOVERNED_CATALOG
IREME_JOBS_DB=PATH_TO_DURABLE_JOBS_AND_AUDIT
IREME_AGENT_CLEARANCE=OPTIONAL_DISCLOSURE_CLEARANCE_ID_FOR_REMOTE_AGENTS
IREME_REPORTS_DB=PATH_TO_DURABLE_REPORT_REPOSITORY
```

The agent gateway is constructed from `GROQ_API_KEY`, `NVIDIA_API_KEY` and/or `OLLAMA_API_KEY` at
startup; with none configured the route fails closed with `503 AGENT_UNAVAILABLE`. Multiple
authorized keys per provider use the `_2`…`_9` suffix (`GROQ_API_KEY_2`, `NVIDIA_API_KEY_2`, …); they
are tried in order only when the earlier credential is rejected or rate-limited, and they do not
raise provider quotas. Keys are read from the environment at call time and redacted from every
error, audit record and log line. Without
`IREME_AGENT_CLEARANCE` agent tasks are local-only and require a local structured-output
provider, otherwise they fail closed with `403 AGENT_POLICY_DENIED`.

For local verification, install `engine/requirements.txt`, configure those values,
then run `python -m uvicorn ireme.api:configured_app --factory --app-dir engine --host 127.0.0.1 --port 8020`.
Missing configuration fails startup. Do not bind this reference adapter as a
production service before the remaining infrastructure requirements pass.

The IdP administrator must assign `app_metadata.tenant_id`, roles, districts and,
only where explicitly permitted, `national_scope=true`. User metadata grants no
authority. Review/publish authorization requires `aal2` and a subject different
from the author. No reviewer signatures or grants are created automatically.

The local reference API exposes `POST /v1/investigations`, `GET /v1/jobs/{run_id}`,
and `POST /v1/investigations/{run_id}/resume` for the registered EICV7 poverty
headcount workflow. Jobs use an in-process FastAPI background worker and local
SQLite checkpoint/audit stores. Creation requires a current permission and
registered indicator definition; the worker rechecks permission and source
hashes before processing. Results remain restricted drafts and create no
certified facts.

Still required for production: Postgres and object-store adapters, durable
Temporal activities, certified fact and report lifecycle routes, hosted
OIDC/JWKS rotation/MFA validation, revocation operations, ingress quotas,
deployed security/operations evidence, and protection or removal of legacy local
UI and artifact export paths.
