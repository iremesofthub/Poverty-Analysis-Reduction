import unittest

from financial_inclusion_data import validate


class FinancialInclusionEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources, cls.observations = validate()

    def test_downloaded_source_checksums_validate(self):
        downloaded = [source for source in self.sources if source["local_file"]]
        self.assertEqual(len(downloaded), 3)
        self.assertTrue(all(len(source["sha256"]) == 64 for source in downloaded))

    def test_finscope_categories_are_exclusive_and_reconcile(self):
        rows = {row["indicator"]: row["value"] for row in self.observations if row["geography_level"] == "national" and not row.get("segment")}
        self.assertEqual(sum(rows[key] for key in (
            "access_strand_banked", "access_strand_other_formal_nonbank", "access_strand_informal_only", "access_strand_excluded"
        )), 100)
        self.assertEqual(rows["formal_inclusion_access_strand"], 92)
        self.assertEqual(rows["overall_inclusion_access_strand"], 96)

    def test_demand_side_and_supply_side_are_not_mixed(self):
        source = next(item for item in self.sources if item["source_id"] == "nisr-finscope-2024-report")
        self.assertIn("survey", source["title"].lower())
        self.assertTrue(all(row["source_id"] == "nisr-finscope-2024-report" for row in self.observations))
        self.assertTrue(any("Demand-side" in row["methodology"] for row in self.observations))
        self.assertFalse(any(row["source_id"] == "nbr-provider-data-2024-q2" for row in self.observations))

    def test_each_observation_has_report_page_lineage(self):
        self.assertTrue(all(row["table_reference"].startswith("Report p. 27") for row in self.observations))
        self.assertEqual(len({row["observation_id"] for row in self.observations}), len(self.observations))


if __name__ == "__main__":
    unittest.main()
