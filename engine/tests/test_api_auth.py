"""ASGI + real cryptographic JWT + persisted metadata integration; hosted IdP is not simulated as validated."""
import copy
import sys
import tempfile
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import api, auth
from ireme.catalog import Catalog
import test_auth as fixture_auth


class GovernedApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture_auth.JwtAuthorization.setUpClass()

    def setUp(self):
        self.signer = fixture_auth.JwtAuthorization()
        self.signer.setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'catalog.db'
        self.audit_path = Path(self.temp.name) / 'audit.db'
        self.catalog = Catalog(self.path, 'tenant-a', 'analyst')
        self.addCleanup(self.catalog.close)
        self.catalog.dataset('eicv7', '1', 'a'*64, 'confidential_microdata', 'b'*64)
        self.catalog.grant('fixture-permit', 'eicv7', '1', ['research'], '2000-01-01T00:00:00Z',
                           '2099-01-01T00:00:00Z', 'c'*64)
        record = {'inputs': {'principal': 'analyst', 'dataset_id': 'eicv7', 'dataset_version': '1',
                            'permission_id': 'fixture-permit', 'purpose': 'research'},
                  'manifest': {'status': 'restricted_draft'}, 'status': 'restricted_draft',
                  'scientific_decision': 'methodology_review_required', 'certified_fact_ids': [],
                  'reasons': ['Fixture review pending'],
                  'differences': [{'geography': 'Kamonyi', 'point_difference': 0.0},
                                  {'geography': 'Muhanga', 'point_difference': 0.0}]}
        self.catalog._insert('scientific-run', 'run-fixture', '1', record)
        self.client = TestClient(api.create_app(self.signer.verifier, self.path, self.audit_path))
        self.addCleanup(self.client.close)

    def request(self, suffix='', payload=None, district='Kamonyi'):
        return self.client.get('/v1/investigations/run-fixture'+suffix, params={'district': district},
                               headers={'Authorization': self.signer.token(payload)})

    def test_every_route_requires_signature_not_browser_roles(self):
        response = self.client.get('/v1/investigations/run-fixture', headers={'X-Role': 'platform_admin'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['error_code'], 'UNAUTHENTICATED')
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertIn('trace_id', response.json())
        self.assertEqual(self.client.get('/openapi.json').status_code, 401)

    def test_scoped_read_filters_other_districts_and_does_not_expose_code_or_stage_data(self):
        response = self.request()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['status'], 'restricted_draft')
        self.assertEqual([r['geography'] for r in body['differences']], ['Kamonyi'])
        self.assertNotIn('code_snapshot', body)
        self.assertNotIn('outputs', body)
        self.assertEqual(body['certified_fact_ids'], [])
        self.assertEqual(self.request(district='Muhanga').status_code, 403)
        self.assertEqual(self.request(district='Rwanda').status_code, 403)

    def test_cross_tenant_and_other_owner_are_inaccessible(self):
        payload = copy.deepcopy(self.signer.payload)
        payload['app_metadata']['tenant_id'] = 'tenant-b'
        self.assertEqual(self.request(payload=payload).status_code, 404)
        payload = {**self.signer.payload, 'sub': 'unrelated-analyst'}
        self.assertEqual(self.request(payload=payload).status_code, 404)

    def test_create_requires_national_scope_and_existing_dataset_permission_before_queue(self):
        payload = copy.deepcopy(self.signer.payload)
        payload['app_metadata']['national_scope'] = True
        response = self.client.post('/v1/investigations', json={
            'dataset_id': 'eicv7', 'dataset_version': '1', 'permission_id': 'not-registered',
            'purpose': 'research', 'indicator_id': 'poverty', 'definition_version': '1',
        }, headers={'Authorization': self.signer.token(payload), 'Idempotency-Key': 'new-run-test-key'})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()['error_code'], 'DATASET_PERMISSION_REQUIRED')
        self.assertEqual(self.client.get('/v1/jobs/run-placeholder',
            headers={'Authorization': self.signer.token(payload)}).status_code, 404)
        self.assertEqual(self.catalog.db.execute('SELECT count(*) FROM revisions WHERE kind="scientific-run"').fetchone()[0], 1)

    def test_unapproved_facts_and_revoked_dataset_cannot_bypass_read_boundary(self):
        response = self.request('/facts')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error_code'], 'FACTS_NOT_CERTIFIED')
        self.catalog.revoke('fixture-permit', 'End fixture grant')
        self.assertEqual(self.request().status_code, 403)
        self.assertEqual(self.request('/facts').status_code, 403)

    def test_identity_outage_has_retryable_error_without_token_echo(self):
        def unavailable(_url):
            raise auth.IdentityProviderUnavailable('fixture outage')
        verifier = auth.TokenVerifier(self.signer.payload['iss'], 'authenticated',
                                      'https://id.example/keys', fetch=unavailable)
        with TestClient(api.create_app(verifier, self.path, self.audit_path)) as client:
            token = self.signer.token()
            response = client.get('/v1/investigations/run-fixture', headers={'Authorization': token})
            self.assertEqual(response.status_code, 503)
            self.assertTrue(response.json()['retryable'])
            self.assertNotIn(token, response.text)

    def test_framework_errors_use_contract_without_echoing_inputs(self):
        headers = {'Authorization': self.signer.token()}
        for method, route, status, code in (
            ('get', '/unknown/private-input', 404, 'NOT_FOUND'),
            ('post', '/v1/investigations/run-fixture', 405, 'METHOD_NOT_ALLOWED'),
        ):
            response = getattr(self.client, method)(route, headers=headers)
            self.assertEqual(response.status_code, status)
            body = response.json()
            self.assertEqual(set(body), {'error_code', 'message', 'trace_id', 'retryable', 'details'})
            self.assertEqual(body['error_code'], code)
            self.assertEqual(body['trace_id'], response.headers['X-Trace-Id'])
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertNotIn('private-input', response.text)

    def test_framework_validation_error_does_not_disclose_bad_value(self):
        # A malformed parameter on a typed route triggers FastAPI's own handler.
        app = api.create_app(self.signer.verifier, self.path, self.audit_path)
        @app.get('/validation-fixture')
        def typed_fixture(count: int):
            return {'count': count}
        with TestClient(app) as client:
            response = client.get('/validation-fixture', params={'count': 'sensitive-bad-value'},
                                  headers={'Authorization': self.signer.token()})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()['error_code'], 'INVALID_REQUEST')
            self.assertNotIn('sensitive-bad-value', response.text)
            self.assertEqual(response.json()['trace_id'], response.headers['X-Trace-Id'])
