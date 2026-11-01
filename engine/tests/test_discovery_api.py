"""Listing endpoints the analyst console depends on.

The AI Engine console must not ask an analyst to paste an investigation id or a
permission id. These tests pin the discovery contract: current permissions,
registered indicators, and the caller's own recent runs, all under the normal
governed authorization, and nothing that leaks another actor's run or the
stored source parameters.
"""
import copy
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import api  # noqa: E402
from ireme.catalog import Catalog  # noqa: E402
from ireme.jobs import JobStore  # noqa: E402
from ireme.profiles import HACKATHON_DEMO_CONFIG, reset_bypass_overrides  # noqa: E402
import test_auth as fixture_auth  # noqa: E402

DEFINITION = {'indicator_id': 'poverty', 'definition_version': '1', 'concept': 'Poverty headcount',
    'unit': 'fraction', 'population': 'person', 'numerator': 'Population below poverty line',
    'denominator': 'All residents', 'survey_wave': 'EICV7', 'geography_version': 'pending-review',
    'weight_variable': 'pop_wt', 'strata_variable': 'strata_id', 'psu_variable': 'clust',
    'missing_rule': 'reject', 'method_version': 'taylor-v1'}

PARAMS = {'tenant': 'tenant-a', 'principal': 'analyst', 'dataset_id': 'eicv7',
          'dataset_version': '1', 'dataset_sha256': 'a' * 64, 'indicator_id': 'poverty',
          'definition_version': '1', 'indicator_sha256': 'd' * 64,
          'permission_id': 'fixture-permit', 'purpose': 'research',
          'code_sha256': 'e' * 64, 'environment': {}}


class DiscoveryEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture_auth.JwtAuthorization.setUpClass()

    def setUp(self):
        reset_bypass_overrides()
        self.addCleanup(reset_bypass_overrides)
        self.signer = fixture_auth.JwtAuthorization()
        self.signer.setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.catalog_path = base / 'catalog.db'
        self.audit_path = base / 'audit.db'
        catalog = Catalog(self.catalog_path, 'tenant-a', 'analyst')
        catalog.dataset('eicv7', '1', 'a' * 64, 'confidential_microdata', 'b' * 64)
        catalog.grant('fixture-permit', 'eicv7', '1', ['research', 'statistics'],
                      '2000-01-01T00:00:00Z', '2099-01-01T00:00:00Z', 'c' * 64)
        catalog.grant('expired-permit', 'eicv7', '1', ['research'],
                      '2000-01-01T00:00:00Z', '2001-01-01T00:00:00Z', 'c' * 64)
        catalog.indicator(DEFINITION)
        catalog.close()

        jobs = JobStore(self.audit_path)
        self.own_run = jobs.submit('governed-science', PARAMS, 'tenant-a:analyst-key', '1.0')
        other = dict(PARAMS, principal='someone-else')
        self.other_run = jobs.submit('governed-science', other, 'tenant-a:other-key', '1.0')
        jobs.close()

        self.client = TestClient(api.create_app(
            self.signer.verifier, self.catalog_path, self.audit_path,
            profile=HACKATHON_DEMO_CONFIG))
        self.addCleanup(self.client.close)

    def token(self, roles=("nisr_analyst",), subject="analyst"):
        payload = copy.deepcopy(self.signer.payload)
        payload["sub"] = subject
        payload["app_metadata"] = {**payload["app_metadata"], "roles": list(roles)}
        return self.signer.token(payload)

    def get(self, path, **kwargs):
        return self.client.get(path, headers={"Authorization": self.token(**kwargs)})

    def test_permissions_are_listable_with_validity_state(self):
        response = self.get('/v1/permissions')
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['count'], 2)
        by_id = {item['permission_id']: item for item in body['permissions']}
        self.assertTrue(by_id['fixture-permit']['active'])
        self.assertFalse(by_id['expired-permit']['active'])
        self.assertFalse(by_id['fixture-permit']['revoked'])
        self.assertEqual(by_id['fixture-permit']['dataset_id'], 'eicv7')
        self.assertEqual(by_id['fixture-permit']['purposes'], ['research', 'statistics'])

    def test_indicators_are_listable(self):
        response = self.get('/v1/indicators')
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['indicators'][0]['indicator_id'], 'poverty')
        self.assertEqual(body['indicators'][0]['definition_version'], '1')
        self.assertEqual(body['indicators'][0]['unit'], 'fraction')

    def test_analyst_sees_own_runs_and_not_another_actors(self):
        response = self.get('/v1/investigations')
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        ids = [run['investigation_id'] for run in body['runs']]
        self.assertIn(self.own_run, ids)
        self.assertNotIn(self.other_run, ids)
        mine = next(run for run in body['runs'] if run['investigation_id'] == self.own_run)
        self.assertTrue(mine['owned'])
        self.assertEqual(mine['dataset_id'], 'eicv7')
        self.assertEqual(mine['status'], 'queued')
        self.assertNotIn('params', mine)
        self.assertNotIn('principal', mine)

    def test_platform_admin_may_see_runs_from_other_actors(self):
        response = self.get('/v1/investigations', roles=("platform_admin",), subject="admin-user")
        self.assertEqual(response.status_code, 200, response.text)
        ids = [run['investigation_id'] for run in response.json()['runs']]
        self.assertIn(self.own_run, ids)
        self.assertIn(self.other_run, ids)

    def test_listing_requires_authentication(self):
        self.assertEqual(self.client.get('/v1/permissions').status_code, 401)
        self.assertEqual(self.client.get('/v1/investigations').status_code, 401)


if __name__ == '__main__':
    unittest.main()
