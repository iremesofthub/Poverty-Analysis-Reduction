# Release profiles and demo bypasses

The engine runs under one of two profiles, selected by `IREME_PROFILE` or
`--profile` on the verification script:

| Profile | Purpose | Governance |
| --- | --- | --- |
| `HACKATHON_DEMO` (default) | NISR 2026 hackathon demo and analyst work | Bypasses are on, outputs are labelled demonstration-only |
| `GOVERNED_PRODUCTION` | Production certification | Every gate is mandatory, no bypass exists |

## What the demo profile changes

The demo profile is for working freely as an analyst with public data. It:

- accepts test identities (`test-statistician`, `test-privacy-officer`,
  `test-release-authority`) in addition to the normal roles;
- lets a signed-in `nisr_analyst` start investigations at AAL1 while MFA is off;
- with `bypass_human_approvals`, lets the analyst record the review signature and
  publish their own report (the safety checks on the report itself still apply);
- labels exports with `DEMONSTRATION / NOT INDEPENDENTLY CERTIFIED`;
- records unmet production gates as a bypass ledger instead of blocking the
  verification run.

The demo profile never grants access to microdata (`allow_microdata_access=False`)
and never certifies a report as production evidence.

## Runtime toggles

In `HACKATHON_DEMO` an admin (`platform_admin` or `admin` role) can flip the
bypasses and MFA without restarting the API. Any signed-in principal can *read*
the current state so the dashboard can show which demo freedoms are active:

```text
GET  /api/v1/admin/mfa/status      -> { mfa_enabled, profile_default, admin_toggle_allowed, profile }
POST /api/v1/admin/mfa/toggle      -> { enabled: true|false }
GET  /api/v1/admin/bypass/status   -> { profile, bypass: { bypass_independent_statistician, bypass_human_approvals, bypass_production_infra, bypass_verification_gates } }
POST /api/v1/admin/bypass/toggle   -> { bypass_human_approvals: true|false, ... }
```

Toggles live in memory only, default to the demo profile values, and are
refused with `403` under `GOVERNED_PRODUCTION` (including the read endpoints,
so production never discloses demo state).

## Verification

```bash
python scripts/verify_engine_completion.py --profile HACKATHON_DEMO
python scripts/verify_engine_completion.py --profile GOVERNED_PRODUCTION   # strict
```

Under `HACKATHON_DEMO` the run exits `0` when only bypassed gates remain, prints
each bypass as `BYPASSED [gate]: ...`, and writes
`docs/implementation/evidence/verification_run.json` with:

- `"profile": "HACKATHON_DEMO"`
- `"demo_mode": true`
- `"production_certified": false`
- `"bypassed_gates": [...]`

Bypassed gates include unmet acceptance scenarios, failing engine tests, open
audit defects, unverified workstreams, repo-suite exits, and source changes made
while the run was in progress. `GOVERNED_PRODUCTION` treats all of them as hard
failures.

That file can never be used as production certification: `production_certified`
is only `true` for a clean `GOVERNED_PRODUCTION` run.

## Tests that assert production behaviour

Governance tests pin `GOVERNED_PRODUCTION_CONFIG` explicitly (for example
`test_reports_api.py` and the elevated-review test in `test_auth.py`), so they
keep testing the strict contract even when the ambient profile is the demo.
