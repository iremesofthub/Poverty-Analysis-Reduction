"""Dictionary hashes are metadata-only and stable for an immutable archive version."""
import io
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ireme.data_eicv7 import HOUSEHOLD, POVERTY, dictionary_fingerprint


def archive_with_label(label):
    poverty = io.BytesIO()
    pd.DataFrame({'hhid': [1], 'pov_jan': [1], 'district': [1], 'pop_wt': [1.0], 'clust': [1]}).to_stata(
        poverty, write_index=False, variable_labels={'pov_jan': label})
    household = io.BytesIO()
    pd.DataFrame({'hhid': [1], 'strata_id': [1]}).to_stata(household, write_index=False)
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w') as zipped:
        zipped.writestr(POVERTY, poverty.getvalue())
        zipped.writestr(HOUSEHOLD, household.getvalue())
    return result.getvalue()


class EICV7DictionaryFingerprint(unittest.TestCase):
    def test_fingerprint_is_stable_and_sensitive_to_variable_definition(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / 'first.zip'
            same = Path(directory) / 'same.zip'
            changed = Path(directory) / 'changed.zip'
            first.write_bytes(archive_with_label('Poverty status'))
            same.write_bytes(archive_with_label('Poverty status'))
            changed.write_bytes(archive_with_label('Different poverty definition'))
            first_hash = dictionary_fingerprint(first)
            self.assertEqual(first_hash, dictionary_fingerprint(same))
            self.assertNotEqual(first_hash, dictionary_fingerprint(changed))


if __name__ == '__main__':
    unittest.main()
