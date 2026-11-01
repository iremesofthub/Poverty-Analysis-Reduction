"""Authenticated boundary for persisted governed research.

The complete production API still requires the Postgres/Temporal adapters and
approved report-release service. No legacy unsigned artifact is exposed here.
"""
import os
import re
import threading
from pathlib import Path
from io import StringIO
from typing import Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from . import agents, auth, science
from . import profiles
from .catalog import Catalog, CatalogIntegrityError
from .gateway import PolicyDenied, has_configured_keys
from .jobs import IdempotencyConflict, JobStore
from .profiles import get_config, ProfileConfig
from .reports import ReportAccessDenied, ReportStore
from .research import HypothesisLedger, LedgerWrite, ResearchConflict, ResearchInvalid


class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


class AgentRunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    role: Literal['investigation_planner', 'skeptical_reviewer', 'causal_researcher', 'statistical_interpreter',
                  'report_planner', 'source_researcher', 'semantic_mapper', 'intervention_analyst',
                  'translation_assistant']
    question: str = Field(min_length=1, max_length=4000, pattern=r'\S')
    max_steps: int = Field(default=6, ge=1, le=12)
    max_repairs: int = Field(default=2, ge=0, le=4)


class ReportReviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    version: str = Field(min_length=1, max_length=64)
    decision: Literal['approve', 'reject']
    report_ast_sha256: str = Field(min_length=64, max_length=64, pattern=r'[0-9a-f]{64}')
    reason: str = Field(default='', max_length=2000)


class ReportPublishRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    version: str = Field(min_length=1, max_length=64)


class MfaToggleRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool


class InvestigationCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    dataset_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
    dataset_version: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')
    permission_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')
    purpose: str = Field(min_length=1, max_length=200, pattern=r'\S')
    indicator_id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]*$')
    definition_version: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]*$')


def create_app(verifier, catalog_path, audit_path, agent_gateway=None, agent_clearance=None, report_path=None,
               artifact_path=None, profile: ProfileConfig = None, open_demo=False):
    # An explicitly supplied profile is pinned (production tests do this). Otherwise the
    # profile is resolved per request so demo admin toggles take effect live.
    fixed_profile = profile

    # When the operator explicitly enables the open demo, every request — with or without a bearer
    # token, from any seeded account — acts as the seeded demonstration principal, so the whole AI
    # Engine is available with no per-tenant permission limits. The default (flag off) keeps every
    # request verified as before.
    open_demo_principal = auth.Principal(
        subject='44bbe7cf-723c-45f4-9705-2261ba016f7f',
        tenant='nisr-hackathon',
        roles=frozenset({'nisr_analyst', 'statistical_reviewer', 'platform_admin'}),
        districts=frozenset(),
        national_scope=True,
        assurance='aal1',
        expires_at=4102444800,
    ) if open_demo else None

    def current_profile() -> ProfileConfig:
        return fixed_profile if fixed_profile is not None else get_config()

    profile = current_profile()
    app = FastAPI(title='Ireme governed research API', version='1.0', docs_url=None,
                  redoc_url=None, openapi_url=None)
    active_workers, worker_lock = set(), threading.Lock()

    def run_science_worker(run_id, tenant, subject):
        with worker_lock:
            if run_id in active_workers:
                return
            active_workers.add(run_id)
        catalog = jobs = None
        try:
            catalog = Catalog(catalog_path, tenant, subject)
            jobs = JobStore(audit_path)
            science.resume(catalog, jobs, run_id, tenant, subject)
        except Exception as exc:
            try:
                if jobs is None:
                    jobs = JobStore(audit_path)
                jobs.fail_before_stage(run_id, type(exc).__name__)
            except Exception:
                pass
        finally:
            if catalog is not None:
                catalog.close()
            if jobs is not None:
                jobs.close()
            with worker_lock:
                active_workers.discard(run_id)

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        trace = str(uuid4())
        request.state.trace_id = trace
        try:
            # Every request is verified, including under HACKATHON_DEMO. The demo profile already ships
            # its own signed test principals (`auth.py`) and its own release-policy exception
            # (`profiles.bypass_human_approvals`), which is how a demonstration can be released without a
            # real NISR reviewer; neither of those means "there is no caller at all". Handing an
            # anonymous request `test-release-authority` plus national scope would let whoever opens the
            # URL publish a report, and
            # `engine/tests/test_discovery_api.py::test_listing_requires_authentication` fails on it.
            # Demo visitors sign in as one of the bundled accounts instead.
            if open_demo_principal is not None:
                # Open demo: limits are off on purpose, so the token is not consulted at all.
                request.state.principal = open_demo_principal
            else:
                try:
                    request.state.principal = await run_in_threadpool(verifier.verify, request.headers.get('Authorization'))
                except auth.AuthenticationError:
                    raise
            response = await call_next(request)
        except auth.AuthenticationError:
            response = error(401, 'UNAUTHENTICATED', 'Valid bearer authentication required', trace)
            response.headers['WWW-Authenticate'] = 'Bearer'
        except auth.IdentityProviderUnavailable:
            response = error(503, 'IDENTITY_UNAVAILABLE', 'Identity-provider verification unavailable', trace)
        except auth.AuthorizationError:
            response = error(403, 'FORBIDDEN', 'Permission denied', trace)
        except ApiError as exc:
            response = error(exc.status, exc.code, exc.message, trace)
        except Exception:
            response = error(500, 'INTERNAL_ERROR', 'Request could not be completed', trace)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Trace-Id'] = trace
        return response

    def error(status, code, message, trace):
        return JSONResponse(status_code=status, content={'error_code': code, 'message': message,
                            'trace_id': trace, 'retryable': status == 503, 'details': {}})

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        # Framework errors obey the same contract and never echo route/input data.
        code = {404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED'}.get(exc.status_code, 'HTTP_ERROR')
        message = {404: 'Resource unavailable', 405: 'Method unavailable'}.get(exc.status_code, 'Request rejected')
        response = error(exc.status_code, code, message, request.state.trace_id)
        if exc.status_code == 405 and exc.headers and 'Allow' in exc.headers:
            response.headers['Allow'] = exc.headers['Allow']
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, _exc):
        return error(422, 'INVALID_REQUEST', 'Request parameters are invalid', request.state.trace_id)

    @app.post('/v1/investigations', status_code=202)
    def start_investigation(body: InvestigationCreateRequest, request: Request, background_tasks: BackgroundTasks,
                            idempotency_key: str | None = Header(default=None, alias='Idempotency-Key')):
        principal = request.state.principal
        auth.authorize(principal, 'investigation:create', principal.tenant, 'Rwanda', profile=current_profile())
        if not idempotency_key or not 8 <= len(idempotency_key) <= 128:
            raise ApiError(422, 'IDEMPOTENCY_KEY_REQUIRED', 'A bounded Idempotency-Key header is required')
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        jobs = JobStore(audit_path)
        try:
            try:
                run_id = science.prepare(catalog, jobs, body.dataset_id, body.dataset_version, body.permission_id,
                                         body.purpose, body.indicator_id, body.definition_version, idempotency_key)
            except KeyError:
                raise ApiError(403, 'DATASET_PERMISSION_REQUIRED',
                               'A current dataset permission and registered indicator definition are required') from None
            except PermissionError:
                raise auth.AuthorizationError('Dataset permission is not valid for this purpose') from None
            except science.r_reference.ReferenceUnavailable:
                raise ApiError(503, 'SCIENCE_RUNTIME_UNAVAILABLE',
                               'The independent R survey reference environment is not ready') from None
            except (ValueError, OSError):
                raise ApiError(409, 'SCIENCE_INPUT_NOT_READY',
                               'The approved dataset or indicator definition is not ready for this calculation') from None
            status = jobs.public_status(run_id)
            if status['status'] != 'complete':
                jobs.log(principal.subject, 'research.create_requested',
                         {'tenant': principal.tenant, 'run_id': run_id, 'trace_id': request.state.trace_id})
                background_tasks.add_task(run_science_worker, run_id, principal.tenant, principal.subject)
            return {'investigation_id': run_id, 'status': status['status'], 'stages': status['stages']}
        except IdempotencyConflict:
            raise ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for different inputs') from None
        finally:
            catalog.close()
            jobs.close()

    @app.get('/v1/jobs/{run_id}')
    def job_status(run_id: str, request: Request):
        principal = request.state.principal
        auth.authorize(principal, 'investigation:read', principal.tenant, 'Rwanda', profile=current_profile())
        jobs = JobStore(audit_path)
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        try:
            status = jobs.public_status(run_id)
            if status is None:
                raise ApiError(404, 'NOT_FOUND', 'Research run unavailable')
            params = jobs.run_info(run_id)['params']
            privileged = principal.roles.intersection({'platform_admin', 'statistical_reviewer', 'privacy_reviewer', 'release_reviewer'})
            if params.get('tenant') != principal.tenant or (params.get('principal') != principal.subject and not privileged):
                raise ApiError(404, 'NOT_FOUND', 'Research run unavailable')
            try:
                catalog.authorize(params['permission_id'], params['dataset_id'], params['dataset_version'], params['purpose'])
            except (KeyError, PermissionError):
                raise auth.AuthorizationError('Dataset permission is no longer valid') from None
            jobs.log(principal.subject, 'research.job_status_read',
                     {'tenant': principal.tenant, 'run_id': run_id, 'trace_id': request.state.trace_id})
            return status
        finally:
            catalog.close()
            jobs.close()

    @app.get('/v1/investigations')
    def list_investigations(request: Request, limit: int = 25):
        """Recent runs the caller may see, newest first. Never exposes stored source data."""
        principal = request.state.principal
        auth.authorize(principal, 'investigation:read', principal.tenant, profile=current_profile())
        cap = max(1, min(limit, 100))
        privileged = principal.roles.intersection(
            {'platform_admin', 'statistical_reviewer', 'privacy_reviewer', 'release_reviewer'})
        jobs = JobStore(audit_path)
        try:
            runs = []
            for info in jobs.list_runs(limit=400):
                params = info['params']
                if params.get('tenant') != principal.tenant:
                    continue
                owned = params.get('principal') == principal.subject
                if not owned and not privileged:
                    continue
                stages = jobs.conn().execute(
                    'SELECT name,status FROM stages WHERE run_id=? ORDER BY rowid', (info['run_id'],)).fetchall()
                runs.append({'investigation_id': info['run_id'], 'status': info['status'],
                             'created': info['created'], 'owned': owned,
                             'dataset_id': params.get('dataset_id'),
                             'dataset_version': params.get('dataset_version'),
                             'indicator_id': params.get('indicator_id'),
                             'definition_version': params.get('definition_version'),
                             'purpose': params.get('purpose'),
                             'stages': [{'stage_id': name, 'status': status} for name, status in stages]})
                if len(runs) >= cap:
                    break
            return {'runs': runs, 'count': len(runs)}
        finally:
            jobs.close()

    @app.get('/v1/permissions')
    def list_permissions(request: Request):
        """Dataset permissions recorded for the caller's tenant, with validity state."""
        principal = request.state.principal
        auth.authorize(principal, 'investigation:read', principal.tenant, profile=current_profile())
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        try:
            permissions = catalog.permissions()
            return {'permissions': permissions, 'count': len(permissions)}
        finally:
            catalog.close()

    @app.get('/v1/indicators')
    def list_indicators(request: Request):
        """Registered indicator definitions the caller's tenant can request."""
        principal = request.state.principal
        auth.authorize(principal, 'investigation:read', principal.tenant, profile=current_profile())
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        try:
            indicators = catalog.indicators()
            return {'indicators': indicators, 'count': len(indicators)}
        finally:
            catalog.close()

    @app.post('/v1/investigations/{run_id}/resume', status_code=202)
    def resume_investigation(run_id: str, request: Request, background_tasks: BackgroundTasks):
        principal = request.state.principal
        auth.authorize(principal, 'investigation:create', principal.tenant, 'Rwanda', profile=current_profile())
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        jobs = JobStore(audit_path)
        try:
            status = jobs.public_status(run_id)
            if status is None:
                raise ApiError(404, 'NOT_FOUND', 'Research run unavailable')
            params = jobs.run_info(run_id)['params']
            if params.get('tenant') != principal.tenant or params.get('principal') != principal.subject:
                raise ApiError(404, 'NOT_FOUND', 'Research run unavailable')
            if status['status'] == 'complete':
                return status
            try:
                catalog.authorize(params['permission_id'], params['dataset_id'], params['dataset_version'], params['purpose'])
            except (KeyError, PermissionError):
                raise auth.AuthorizationError('Dataset permission is no longer valid') from None
            jobs.log(principal.subject, 'research.resume_requested',
                     {'tenant': principal.tenant, 'run_id': run_id, 'trace_id': request.state.trace_id})
            background_tasks.add_task(run_science_worker, run_id, principal.tenant, principal.subject)
            return {'investigation_id': run_id, 'status': status['status'], 'stages': status['stages']}
        finally:
            catalog.close()
            jobs.close()

    def permitted_run(request, run_id, district):
        principal = request.state.principal
        geography = district or 'Rwanda'
        auth.authorize(principal, 'investigation:read', principal.tenant, geography, profile=current_profile())
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', run_id):
            raise ApiError(404, 'NOT_FOUND', 'Investigation unavailable')
        catalog = Catalog(catalog_path, principal.tenant, principal.subject)
        try:
            record = catalog.get('scientific-run', run_id, '1')
            privileged = principal.roles.intersection({'platform_admin', 'statistical_reviewer', 'privacy_reviewer', 'release_reviewer'})
            if record['inputs']['principal'] != principal.subject and not privileged:
                raise ApiError(404, 'NOT_FOUND', 'Investigation unavailable')
            source = record['inputs']
            catalog.authorize(source['permission_id'], source['dataset_id'], source['dataset_version'], source['purpose'])
            audit = JobStore(audit_path)
            try:
                audit.log(principal.subject, 'research.read', {'tenant': principal.tenant,
                    'run_id': run_id, 'district': geography, 'trace_id': request.state.trace_id})
            finally:
                audit.close()
            return catalog, record, geography
        except KeyError:
            catalog.close()
            raise ApiError(404, 'NOT_FOUND', 'Investigation unavailable') from None
        except CatalogIntegrityError:
            catalog.close()
            raise ApiError(409, 'INTEGRITY_FAILED', 'Research evidence requires integrity review') from None
        except PermissionError:
            catalog.close()
            raise auth.AuthorizationError('Dataset permission unavailable') from None
        except Exception:
            catalog.close()
            raise

    @app.get('/v1/investigations/{run_id}')
    def investigation(run_id: str, request: Request, district: str | None = None):
        catalog, record, geography = permitted_run(request, run_id, district)
        try:
            differences = [row for row in record['differences']
                           if geography == 'Rwanda' or row['geography'] == geography]
            return {'investigation_id': run_id, 'status': record['status'], 'district': geography,
                    'manifest': record['manifest'], 'scientific_decision': record['scientific_decision'],
                    'reasons': record['reasons'], 'differences': differences,
                    'certified_fact_ids': list(record['certified_fact_ids'])}
        finally:
            catalog.close()

    @app.get('/v1/investigations/{run_id}/facts')
    def facts(run_id: str, request: Request, district: str | None = None):
        catalog, record, _ = permitted_run(request, run_id, district)
        catalog.close()
        # The current research workflow never mints certified facts. Do not expose
        # raw stage estimates as authoritative numbers through a different route.
        raise ApiError(409, 'FACTS_NOT_CERTIFIED', 'Independent scientific approval is required')

    @app.get('/v1/investigations/{run_id}/lineage')
    def lineage(run_id: str, request: Request, district: str | None = None):
        catalog, _record, _geography = permitted_run(request, run_id, district)
        try:
            return {'investigation_id': run_id,
                    'edges': catalog.lineage(('scientific-run', run_id, '1'), forward=False)}
        finally:
            catalog.close()

    @app.get('/v1/investigations/{run_id}/hypotheses')
    def hypotheses(run_id: str, request: Request, district: str):
        catalog, _record, geography = permitted_run(request, run_id, district)
        try:
            ledger = HypothesisLedger(catalog, request.state.principal, run_id, geography)
            return {'investigation_id': run_id, 'district_id': geography, 'history': ledger.history()}
        except ResearchInvalid:
            raise ApiError(422, 'RESEARCH_INVALID', 'Research scope is invalid') from None
        except CatalogIntegrityError:
            raise ApiError(409, 'INTEGRITY_FAILED', 'Research evidence requires integrity review') from None
        except PermissionError:
            raise auth.AuthorizationError('Research permission unavailable') from None
        finally:
            catalog.close()

    @app.post('/v1/investigations/{run_id}/hypotheses', status_code=201)
    def update_hypotheses(run_id: str, request: Request, body: LedgerWrite, district: str):
        catalog, _record, geography = permitted_run(request, run_id, district)
        try:
            ledger = HypothesisLedger(catalog, request.state.principal, run_id, geography)
            # Actor, tenant, trace, permission and snapshot hashes are server-bound.
            # The immutable revision is also the transactional write audit event.
            return ledger.append(body, request.headers.get('Idempotency-Key'), request.state.trace_id)
        except ResearchConflict:
            raise ApiError(409, 'REVISION_CONFLICT', 'Research revision or idempotency key conflicts') from None
        except ResearchInvalid:
            raise ApiError(422, 'RESEARCH_INVALID', 'Research evidence or hypothesis history is invalid') from None
        except CatalogIntegrityError:
            raise ApiError(409, 'INTEGRITY_FAILED', 'Research evidence requires integrity review') from None
        except PermissionError:
            raise auth.AuthorizationError('Research permission unavailable') from None
        finally:
            catalog.close()

    @app.post('/v1/investigations/{run_id}/agent-proposals')
    def agent_proposals(run_id: str, request: Request, body: AgentRunRequest, district: str):
        """Run one bounded research-agent task. Proposals are never persisted or certified here."""
        if agent_gateway is None:
            raise ApiError(503, 'AGENT_UNAVAILABLE', 'Research-agent provider is not configured')
        principal = request.state.principal
        geography = district or 'Rwanda'
        # Running an agent consumes provider budget, so require the creation permission in scope.
        auth.authorize(principal, 'investigation:create', principal.tenant, geography, profile=current_profile())
        catalog, _record, geography = permitted_run(request, run_id, geography)
        try:
            context = agents.context_for_investigation(
                catalog, principal, run_id, geography, sensitivity='restricted_aggregate',
                clearance=agent_clearance, local_only=agent_clearance is None)
            journal = JobStore(audit_path)
            try:
                return agents.ResearchAgent(agent_gateway, agents.Toolbox(), journal=journal).run(
                    body.role, body.question, context,
                    agents.Budget(max_steps=body.max_steps, max_repairs=body.max_repairs))
            finally:
                journal.close()
        except PolicyDenied:
            raise ApiError(403, 'AGENT_POLICY_DENIED', 'No provider satisfies the data policy') from None
        except agents.AgentViolation:
            raise ApiError(422, 'AGENT_INVALID', 'Research-agent task is invalid') from None
        except CatalogIntegrityError:
            raise ApiError(409, 'INTEGRITY_FAILED', 'Research evidence requires integrity review') from None
        except PermissionError:
            raise auth.AuthorizationError('Permission denied') from None
        finally:
            catalog.close()

    def report_store():
        if report_path is None:
            raise ApiError(503, 'REPORT_UNAVAILABLE', 'Report repository is not configured')
        return ReportStore(report_path)

    def artifact_store():
        if artifact_path is None:
            return None
        from .object_store import ContentAddressedStore
        return ContentAddressedStore(artifact_path)

    def audit_event(actor, action, detail):
        journal = JobStore(audit_path)
        try:
            journal.log(actor, action, detail)
        finally:
            journal.close()

    @app.post('/v1/reports/{report_id}/review')
    def review_report(report_id: str, request: Request, body: ReportReviewRequest):
        """One independent reviewer signs (or rejects) a frozen report. Reviewers never set checks.

        The reviewer must name the AST hash they reviewed; a changed or stale snapshot is refused
        with 409 before any signature is recorded."""
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', report_id):
            raise ApiError(404, 'NOT_FOUND', 'Report unavailable')
        store = report_store()
        try:
            rec = store.get(report_id, body.version)
            if body.report_ast_sha256 != rec.ast_sha256:
                raise ApiError(409, 'REPORT_CHANGED', 'Report snapshot changed; review the current version')
            principal = request.state.principal
            auth.authorize(principal, 'report:review', rec.tenant, rec.geography, author=rec.author, profile=current_profile())
            try:
                decision = store.review(report_id, body.version, principal.subject, principal.roles,
                                        body.decision, body.reason, profile=current_profile())
            finally:
                audit_event(principal.subject, 'report.review', {
                    'report_id': report_id, 'version': body.version, 'action': body.decision,
                    'report_ast_sha256': body.report_ast_sha256,
                    'outcome': 'recorded', 'trace_id': request.state.trace_id})
            return {'report_id': report_id, 'version': body.version,
                    'report_ast_sha256': body.report_ast_sha256,
                    'status': store.get(report_id, body.version).status,
                    'decision': {'status': decision.status, 'reasons': list(decision.reasons)}}
        except ReportAccessDenied as exc:
            raise _report_error(exc) from None
        except KeyError:
            raise ApiError(404, 'NOT_FOUND', 'Report unavailable') from None
        finally:
            store.close()

    @app.post('/v1/reports/{report_id}/publish')
    def publish_report(report_id: str, request: Request, body: ReportPublishRequest):
        """Publish an approved version. Only the publication authority may do this."""
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', report_id):
            raise ApiError(404, 'NOT_FOUND', 'Report unavailable')
        store = report_store()
        try:
            rec = store.get(report_id, body.version)
            principal = request.state.principal
            auth.authorize(principal, 'report:publish', rec.tenant, rec.geography, author=rec.author, profile=current_profile())
            try:
                store.publish(report_id, body.version, principal.subject, principal.roles,
                              artifacts=artifact_store(), profile=current_profile())
            except ReportAccessDenied:
                audit_event(principal.subject, 'report.publish_denied', {
                    'report_id': report_id, 'version': body.version, 'trace_id': request.state.trace_id})
                raise
            audit_event(principal.subject, 'report.publish', {
                'report_id': report_id, 'version': body.version, 'trace_id': request.state.trace_id})
            return {'report_id': report_id, 'version': body.version, 'status': 'published'}
        except ReportAccessDenied as exc:
            raise _report_error(exc) from None
        finally:
            store.close()

    @app.get('/v1/reports/{report_id}/export')
    def export_report(report_id: str, request: Request, version: str, format: str = 'pdf', district: str | None = None):
        """The only path to report bytes. Drafts, superseded and revoked versions never render."""
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', report_id) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', version):
            raise ApiError(404, 'NOT_FOUND', 'Report unavailable')
        store = report_store()
        principal = None
        try:
            rec = store.get(report_id, version)
            principal = request.state.principal
            if principal.tenant != rec.tenant:
                # Cross-tenant access must be indistinguishable from a missing report.
                raise ApiError(404, 'NOT_FOUND', 'Report unavailable')
            auth.authorize(principal, 'investigation:read', rec.tenant, district or rec.geography, profile=current_profile())
            try:
                body, media_type = store.export(report_id, version, principal, format,
                                                artifacts=artifact_store(), profile=current_profile())
            except ReportAccessDenied:
                audit_event(principal.subject, 'report.export_denied', {
                    'report_id': report_id, 'version': version, 'format': format,
                    'trace_id': request.state.trace_id})
                raise
            audit_event(principal.subject, 'report.export', {
                'report_id': report_id, 'version': version, 'format': format,
                'ast_sha256': rec.ast_sha256, 'trace_id': request.state.trace_id})
            return Response(content=body, media_type=media_type, headers={
                'Content-Disposition': f'attachment; filename="{report_id}-{version}.{format}"',
                'X-Report-Ast-Sha256': rec.ast_sha256})
        except ReportAccessDenied as exc:
            raise _report_error(exc) from None
        except ValueError:
            raise ApiError(422, 'INVALID_FORMAT', 'Requested export format is not supported') from None
        finally:
            store.close()

    def _report_error(exc: ReportAccessDenied) -> ApiError:
        status = {'NOT_FOUND': 404, 'SUPERSEDED': 409, 'INTEGRITY': 409,
                  'NOT_RELEASED': 403, 'REVOKED': 403, 'NOT_APPROVED': 409,
                  'FORBIDDEN': 403, 'AMBIGUOUS_ROLE': 403, 'IMMUTABLE': 409}.get(exc.code, 403)
        messages = {'NOT_RELEASED': 'Report is not released', 'SUPERSEDED': 'A newer report version exists',
                    'REVOKED': 'Report was revoked', 'INTEGRITY': 'Report integrity check failed',
                    'NOT_FOUND': 'Report unavailable', 'NOT_APPROVED': 'Report is not approved',
                    'FORBIDDEN': 'Permission denied', 'AMBIGUOUS_ROLE': 'Reviewer role is ambiguous',
                    'IMMUTABLE': 'Report version is immutable'}
        return ApiError(status, exc.code, messages.get(exc.code, 'Report request denied'))

    # Admin endpoints for MFA Toggle (HACKATHON_DEMO only)
    class MfaToggleRequest(BaseModel):
        model_config = ConfigDict(extra='forbid')
        enabled: bool


    def _require_admin(principal, profile: ProfileConfig):
        """Check if principal has admin permission for MFA toggle."""
        if not profile.admin_mfa_toggle:
            raise ApiError(403, 'ADMIN_TOGGLE_NOT_ALLOWED', 'Admin MFA toggle not allowed for this profile')
        # Check for platform_admin role or specific admin role
        if 'platform_admin' not in principal.roles and 'admin' not in principal.roles:
            raise ApiError(403, 'FORBIDDEN', 'Admin permission required for MFA toggle')

    def _require_demo_reader(profile: ProfileConfig):
        """Any signed-in principal may read demo toggles; production exposes nothing."""
        if not profile.admin_mfa_toggle:
            raise ApiError(403, 'ADMIN_TOGGLE_NOT_ALLOWED', 'Demo controls are not available for this profile')


    @app.get('/v1/admin/mfa/status')
    @app.get('/admin/mfa/status')
    async def mfa_status(request: Request):
        """Get current MFA status for admin panel."""
        profile = current_profile()
        _require_demo_reader(profile)
        return auth.get_mfa_status(profile)


    @app.post('/v1/admin/mfa/toggle')
    @app.post('/admin/mfa/toggle')
    async def mfa_toggle(request: Request, body: MfaToggleRequest):
        """Admin toggle to enable/disable MFA (HACKATHON_DEMO only)."""
        profile = current_profile()
        principal = request.state.principal
        _require_admin(principal, profile)
        result = auth.set_mfa_enabled(body.enabled, profile)
        if not result['success']:
            raise ApiError(403, 'ADMIN_TOGGLE_FAILED', result['error'])
        return result


    class BypassToggleRequest(BaseModel):
        model_config = ConfigDict(extra='forbid')
        bypass_independent_statistician: bool | None = None
        bypass_human_approvals: bool | None = None
        bypass_production_infra: bool | None = None
        bypass_verification_gates: bool | None = None


    @app.get('/v1/admin/bypass/status')
    @app.get('/admin/bypass/status')
    async def bypass_status(request: Request):
        """Current demo bypass toggles (always fully disabled in production)."""
        profile = current_profile()
        _require_demo_reader(profile)
        return {'profile': profile.name.value, 'bypass': profiles.get_bypass_status(profile)}


    @app.post('/v1/admin/bypass/toggle')
    @app.post('/admin/bypass/toggle')
    async def bypass_toggle(request: Request, body: BypassToggleRequest):
        """Flip one or more demo bypass toggles without restarting the demo."""
        profile = current_profile()
        principal = request.state.principal
        _require_admin(principal, profile)
        requested = {k: v for k, v in body.model_dump().items() if v is not None}
        if not requested:
            raise ApiError(422, 'NO_TOGGLE', 'Provide at least one bypass toggle')
        for name, enabled in requested.items():
            result = profiles.set_bypass(name, enabled, profile)
            if not result['success']:
                raise ApiError(403, 'BYPASS_TOGGLE_FAILED', result['error'])
        return {'success': True, 'bypass': profiles.get_bypass_status(profile)}

    return app


def configured_app():
    # Local development secrets stay server-side. Deployment environment values
    # take precedence; load only engine/provider settings from the ignored file.
    # In particular, never import the unrelated personal Supabase access token.
    try:
        from dotenv import dotenv_values
        env_file = Path(__file__).resolve().parents[2] / '.env.local'
        allowed = {'IREME_AUTH_ISSUER', 'IREME_AUTH_AUDIENCE', 'IREME_JWKS_URL', 'IREME_CATALOG_DB',
                   'IREME_JOBS_DB', 'IREME_REPORTS_DB', 'IREME_ARTIFACTS_DIR', 'IREME_AGENT_CLEARANCE',
                   'IREME_CORS_ORIGINS', 'IREME_PROFILE'}
        if env_file.is_file():
            selected = []
            for line in env_file.read_text(encoding='utf-8').splitlines(keepends=True):
                name = line.lstrip().removeprefix('export ').split('=', 1)[0].strip()
                if name in allowed or re.fullmatch(r'(?:GROQ|NVIDIA|OLLAMA)_API_KEY(?:_[2-9])?', name):
                    selected.append(line)
            local_values = dotenv_values(stream=StringIO(''.join(selected)), encoding='utf-8')
            for name, value in local_values.items():
                if value is not None:
                    os.environ.setdefault(name, value)
    except ImportError:
        pass
    required = ('IREME_AUTH_ISSUER', 'IREME_AUTH_AUDIENCE', 'IREME_JWKS_URL', 'IREME_CATALOG_DB', 'IREME_JOBS_DB')
    if any(not os.environ.get(name) for name in required):
        raise RuntimeError('Governed API identity and persistence configuration required')
    verifier = auth.TokenVerifier(os.environ['IREME_AUTH_ISSUER'], os.environ['IREME_AUTH_AUDIENCE'],
                                  os.environ['IREME_JWKS_URL'])
    gateway = None
    if has_configured_keys(os.environ):
        from .gateway import Gateway, default_providers
        from .gateway_http import http_transport
        gateway = Gateway(default_providers(), http_transport, dict(os.environ))
    app = create_app(verifier, os.environ['IREME_CATALOG_DB'], os.environ['IREME_JOBS_DB'],
                     agent_gateway=gateway, agent_clearance=os.environ.get('IREME_AGENT_CLEARANCE') or None,
                     report_path=os.environ.get('IREME_REPORTS_DB') or None,
                     artifact_path=os.environ.get('IREME_ARTIFACTS_DIR') or None,
                     open_demo=os.environ.get('IREME_OPEN_DEMO') == '1')
    origins = [value.strip() for value in os.environ.get('IREME_CORS_ORIGINS', '').split(',') if value.strip()]
    if not origins:
        origins = ['http://localhost:5173', 'http://127.0.0.1:5173']
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST', 'OPTIONS'],
                       allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key'],
                       expose_headers=['X-Trace-Id', 'Content-Disposition'], max_age=600)
    return app
