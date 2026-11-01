"""Resume identity checks that never open survey data."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme import science
from ireme.jobs import JobStore


class ScienceResumeIdentity(unittest.TestCase):
    def test_resume_resubmits_with_original_unscoped_key(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs = JobStore(Path(directory) / 'jobs.sqlite')
            params = {
                'tenant': 'tenant-a', 'principal': 'analyst-1', 'dataset_id': 'synthetic',
                'dataset_version': '1', 'permission_id': 'fixture-permission', 'purpose': 'test',
                'indicator_id': 'fixture-indicator', 'definition_version': '1',
            }
            run_id = jobs.submit('governed-science', params, 'tenant-a:resume-key', science.VERSION)
            catalog = type('CatalogIdentity', (), {'tenant': 'tenant-a', 'principal': 'analyst-1'})()
            with patch.object(science, 'execute', return_value={'run_id': run_id}) as execute:
                result = science.resume(catalog, jobs, run_id, 'tenant-a', 'analyst-1')
            try:
                self.assertEqual(result, {'run_id': run_id})
                self.assertEqual(execute.call_args.args[8], 'resume-key')
                self.assertEqual(jobs.run_info(run_id)['run_id'], run_id)
            finally:
                jobs.close()

    def test_resume_rejects_run_from_another_tenant(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs = JobStore(Path(directory) / 'jobs.sqlite')
            run_id = jobs.submit('governed-science', {'tenant': 'tenant-a', 'principal': 'analyst-1'},
                                 'tenant-a:resume-key', science.VERSION)
            catalog = type('CatalogIdentity', (), {'tenant': 'tenant-b', 'principal': 'analyst-1'})()
            try:
                with self.assertRaises(PermissionError):
                    science.resume(catalog, jobs, run_id, 'tenant-b', 'analyst-1')
            finally:
                jobs.close()


if __name__ == '__main__':
    unittest.main()
