import copy
from datetime import datetime, timezone
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme.catalog import Catalog, RevisionConflict


DEFINITION = {'indicator_id': 'poverty', 'definition_version': '1', 'concept': 'Poverty headcount',
    'unit': 'fraction', 'population': 'person', 'numerator': 'Population below poverty line',
    'denominator': 'All residents', 'survey_wave': 'EICV7', 'geography_version': 'pending-review',
    'weight_variable': 'pop_wt', 'strata_variable': 'strata_id', 'psu_variable': 'clust',
    'missing_rule': 'reject', 'method_version': 'taylor-v1'}


class PersistentCatalog(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'catalog.db'
        self.catalog = Catalog(self.path, 'tenant-a', 'steward')
        self.addCleanup(self.catalog.close)
        self.catalog.dataset('eicv7', 'v1', 'a'*64, 'confidential_microdata', 'b'*64)
        self.catalog.indicator(DEFINITION)
        self.catalog.grant('permit', 'eicv7', 'v1', ['research'], '2000-01-01T00:00:00Z',
                           '2099-01-01T00:00:00Z', 'c'*64)

    def test_restart_and_immutable_definition_versions(self):
        opened = Catalog(self.path, 'tenant-a', 'reader')
        self.addCleanup(opened.close)
        self.assertEqual(opened.get('indicator', 'poverty', '1'), DEFINITION)
        changed = copy.deepcopy(DEFINITION)
        changed['population'] = 'household'
        with self.assertRaises(RevisionConflict):
            opened.indicator(changed)
        changed['definition_version'] = '2'
        opened.indicator(changed)
        changed['population'] = 'mutated-after-insert'
        self.assertEqual(opened.get('indicator', 'poverty', '2')['population'], 'household')
        self.assertEqual(opened.get('indicator', 'poverty', '1')['population'], 'person')
        with self.assertRaises(sqlite3.IntegrityError):
            opened.db.execute("UPDATE revisions SET payload='{}'")
        opened.db.rollback()

    def test_tenant_scope_and_purpose_expiry_revocation(self):
        other = Catalog(self.path, 'tenant-b', 'other')
        self.addCleanup(other.close)
        with self.assertRaises(KeyError):
            other.get('dataset', 'eicv7', 'v1')
        for dataset, version, purpose, at in [('eicv7', 'v1', 'payments', None),
            ('eicv7', 'v2', 'research', None), ('eicv7', 'v1', 'research', datetime(2100, 1, 1, tzinfo=timezone.utc))]:
            with self.assertRaises(PermissionError):
                self.catalog.authorize('permit', dataset, version, purpose, at)
        self.catalog.authorize('permit', 'eicv7', 'v1', 'research')
        self.catalog.revoke('permit', 'Fixture revocation')
        with self.assertRaises(PermissionError):
            self.catalog.authorize('permit', 'eicv7', 'v1', 'research')

    def test_forward_backward_lineage_and_wrong_dataset_license(self):
        source = ('dataset', 'eicv7', 'v1')
        indicator = ('indicator', 'poverty', '1')
        self.catalog.link(source, indicator, 'd'*64, 'permit', 'research')
        self.assertEqual(self.catalog.lineage(source)[0]['child'], indicator)
        self.assertEqual(self.catalog.lineage(indicator, forward=False)[0]['parent'], source)
        with self.assertRaises(ValueError):
            self.catalog.link(indicator, source, 'd'*64, 'permit', 'research')
        self.catalog.dataset('other-data', 'v1', 'e'*64, 'public', 'b'*64)
        with self.assertRaises(PermissionError):
            self.catalog.link(('dataset', 'other-data', 'v1'), indicator, 'd'*64, 'permit', 'research')

    def test_missing_license_and_schema_errors_fail_closed(self):
        with self.assertRaises(KeyError):
            self.catalog.authorize('missing', 'eicv7', 'v1', 'research')
        with self.assertRaises(ValueError):
            self.catalog.grant('bad', 'eicv7', 'v1', ['research'], '2026-01-01', '2027-01-01', 'c'*64)
        invalid = dict(DEFINITION)
        del invalid['denominator']
        with self.assertRaises(ValueError):
            self.catalog.indicator(invalid)


class ConcurrentFirstOpen(unittest.TestCase):
    def test_parallel_cold_opens_do_not_fail_on_lock_contention(self):
        """The console reads permissions, indicators and runs at the same time."""
        import threading
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / 'catalog.db'
        errors, opened = [], []
        lock = threading.Lock()
        start = threading.Barrier(8)

        def open_catalog():
            try:
                start.wait(timeout=10)
                catalog = Catalog(path, 'tenant-a', 'analyst')
                catalog.close()
                with lock:
                    opened.append(True)
            except Exception as exc:  # noqa: BLE001 - the failure is the assertion
                with lock:
                    errors.append(exc)

        threads = [threading.Thread(target=open_catalog) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertEqual(errors, [])
        self.assertEqual(len(opened), 8)
