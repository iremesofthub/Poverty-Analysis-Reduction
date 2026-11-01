"""Real calculation with fixture permissions. No actual licence/signoff is invented."""
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import data_eicv7, jobs, r_reference, science
from ireme.catalog import Catalog

ROOT = Path(__file__).resolve().parents[2]


class ScienceWorkflow(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.catalog = Catalog(Path(self.temp.name) / 'catalog.db', 'fixture-tenant', 'fixture-steward')
        self.jobs = jobs.JobStore(Path(self.temp.name) / 'jobs.db')
        self.addCleanup(self.catalog.close)
        self.addCleanup(self.jobs.close)

    def run_science(self, key='test-run'):
        return science.execute(self.catalog, self.jobs, 'eicv7', '1', 'fixture-permit', 'research',
                               'poverty', '1', key)

    def setup_definition(self, sha):
        self.catalog.dataset('eicv7', '1', sha, 'confidential_microdata', 'b'*64)
        self.catalog.grant('fixture-permit', 'eicv7', '1', ['research'], '2000-01-01T00:00:00Z',
                           '2099-01-01T00:00:00Z', 'c'*64)
        self.definition = {**science.MAPPING, 'indicator_id': 'poverty', 'definition_version': '1',
                           'concept': 'Poverty headcount', 'unit': 'fraction', 'geography_version': 'fixture-boundary-pending-review',
                           'source_dictionary_hash': 'b'*64}

    def test_unlicensed_run_blocks_before_any_data_or_job_creation(self):
        with self.assertRaises(KeyError):
            self.run_science()
        self.assertEqual(self.jobs.conn().execute('SELECT count(*) FROM runs').fetchone()[0], 0)

    def test_definition_unit_substitution_blocked_before_raw_read(self):
        self.setup_definition('a'*64)
        self.definition['population'] = 'household'
        self.catalog.indicator(self.definition)
        with self.assertRaisesRegex(ValueError, 'population'):
            self.run_science()
        self.assertEqual(self.jobs.conn().execute('SELECT count(*) FROM runs').fetchone()[0], 0)

    @unittest.skipUnless(os.environ.get('IREME_ENABLE_REAL_MICRODATA_TESTS') == '1'
                         and data_eicv7.available() and r_reference.rscript_path(),
                         'Explicit real-microdata test opt-in, archive, and R required')
    def test_real_governed_run_resume_lineage_and_revocation(self):
        self.setup_definition(hashlib.sha256(data_eicv7.zip_path().read_bytes()).hexdigest())
        self.catalog.indicator(self.definition)
        run = self.run_science()
        self.assertEqual(run['result']['status'], 'restricted_draft')
        self.assertEqual(run['result']['certified_fact_ids'], [])
        self.assertEqual(len(run['trace']['outputs']['primary']['estimates']), 31)
        self.assertEqual(len(run['trace']['outputs']['reference']['contrasts']), 30)
        differences = run['result']['differences']
        self.assertEqual(len(differences), 61)
        self.assertLess(max(abs(r['point_difference']) for r in differences), 1e-12)
        self.assertLess(max(abs(r['se_difference']) for r in differences), 1e-10)
        again = self.run_science()
        self.assertEqual(set(again['trace']['skipped']), {'primary', 'reference', 'reconciliation'})
        self.assertEqual(again['result'], run['result'])
        self.assertTrue(self.catalog.lineage(('dataset', 'eicv7', '1')))
        self.assertEqual(self.catalog.get('scientific-run', run['run_id'], '1'), run['result'])
        evidence = {'status': run['result']['status'], 'certified_fact_ids': [],
            'dataset_sha256': run['result']['inputs']['dataset_sha256'],
            'code_sha256': run['result']['inputs']['code_sha256'],
            'differences': differences, 'resumed_stages': again['trace']['skipped'],
            'permission_evidence': 'SYNTHETIC_FIXTURE_NOT_ACTUAL_DATASET_LICENCE'}
        (ROOT / 'docs/implementation/evidence/governed_science_workflow.json').write_text(json.dumps(evidence, indent=2))
        self.catalog.revoke('fixture-permit', 'End synthetic test grant')
        with self.assertRaises(PermissionError):
            self.run_science()

    def test_modified_checkpoint_blocks_instead_of_feeding_downstream_stage(self):
        run = self.jobs.submit('fixture', {}, 'integrity-fixture', '1')
        stages = [('first', lambda p, u: {'value': 1}, None), ('second', lambda p, u: {'value': 2}, None)]
        self.jobs.execute(run, stages)
        self.jobs.conn().execute("UPDATE stages SET output=? WHERE run_id=? AND name='first'",
                                 ('{"value":999}', run))
        with self.assertRaises(jobs.CheckpointIntegrityError):
            self.jobs.execute(run, stages)
        self.assertEqual(self.jobs.run_info(run)['status'], 'failed')
        self.assertEqual(self.jobs.verify_audit(), (True, None))
