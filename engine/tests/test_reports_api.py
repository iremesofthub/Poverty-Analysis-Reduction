"""Governed report lifecycle over the ASGI boundary: freeze -> independent review -> publish -> export.

Synthetic fixtures with real signed tokens and a real SQLite store. No hosted IdP or
production Postgres is exercised, so this is component evidence, not acceptance evidence.
"""
import copy
import json
import sys
import tempfile
import time
from pathlib import Path
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from acceptance import acceptance  # noqa: E402
from ireme import api, release_gate, report, reports  # noqa: E402
from ireme.jobs import JobStore  # noqa: E402
from ireme.profiles import GOVERNED_PRODUCTION_CONFIG  # noqa: E402
import test_auth as fixture_auth  # noqa: E402

CHECKS = {k: True for k in release_gate.load_policy()["required"] if k != "authorized_reviewer_signatures"}


def ast_for(version="1", report_id="rep1", status="draft"):
    return report.build_ast(report_id, version, "Kamonyi findings", status, [{
        "id": "summary", "title": "Poverty estimates",
        "claims": [{"claim_id": "c1", "text": "Kamonyi: 39.7%; national: 27.4%."}],
        "tables": [{"id": "Estimates", "title": "Survey results", "columns": ["District", "Rate"],
                    "rows": [["Kamonyi", "39.7"], ["Rwanda", "27.4"]]}],
        "charts": [{"id": "rates", "title": "Rates", "table_id": "Estimates", "x": "District", "y": "Rate"}],
    }], ["Independent scientific review pending."], "External comparison pending.")


def document(version="1", report_id="rep1"):
    return {"report_id": report_id, "report_version": version, "investigation_id": "inv1",
            "fact_snapshot_sha256": "a" * 64, "comparison_snapshot_sha256": "b" * 64,
            "policy_version": "1.0", "status": "draft", "audience": "public",
            "sections": [{"section_id": "summary", "claim_ids": ["c1"]}], "claim_ids": ["c1"],
            "warnings": [], "approval_ids": []}


class ReportLifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixture_auth.JwtAuthorization.setUpClass()

    def setUp(self):
        self.signer = fixture_auth.JwtAuthorization()
        self.signer.setUp()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.store_path = base / "reports.db"
        self.store = reports.ReportStore(self.store_path)
        self.addCleanup(self.store.close)
        self.client = TestClient(api.create_app(self.signer.verifier, base / "catalog.db", base / "audit.db",
                                                report_path=self.store_path,
                                                profile=GOVERNED_PRODUCTION_CONFIG))
        self.addCleanup(self.client.close)

    # ---- helpers -------------------------------------------------------------------------
    def token(self, subject, roles, districts=("Kamonyi",), aal="aal2", tenant="tenant-a"):
        payload = copy.deepcopy(self.signer.payload)
        payload["sub"] = subject
        payload["aal"] = aal
        payload["app_metadata"] = {"tenant_id": tenant, "roles": list(roles), "districts": list(districts)}
        return self.signer.token(payload)

    def review(self, subject, role, action="approve", version="1", **kw):
        ast_sha256 = kw.pop("report_ast_sha256", None) or self.store.get("rep1", version).ast_sha256
        return self.client.post(f"/v1/reports/rep1/review",
                                json={"version": version, "decision": action,
                                      "report_ast_sha256": ast_sha256},
                                headers={"Authorization": self.token(subject, [role], **kw)})

    def approve_all(self, version="1"):
        for subject, role in (("rev-stat", "statistical_reviewer"), ("rev-priv", "privacy_reviewer"),
                              ("rev-release", "release_reviewer")):
            response = self.review(subject, role, version=version)
            self.assertEqual(response.status_code, 200, response.text)
        return response

    def publish(self, subject="publisher", role="publication_authority", version="1", **kw):
        return self.client.post("/v1/reports/rep1/publish", json={"version": version},
                                headers={"Authorization": self.token(subject, [role], **kw)})

    def export(self, fmt="pdf", version="1", subject="analyst", role="nisr_analyst", **kw):
        return self.client.get("/v1/reports/rep1/export", params={"version": version, "format": fmt},
                               headers={"Authorization": self.token(subject, [role], **kw)})

    def freeze(self, version="1", checks=None):
        return self.store.create(document(version), ast_for(version), "analyst", "Kamonyi", "tenant-a",
                                 CHECKS if checks is None else checks)

    # ---- tests ---------------------------------------------------------------------------
    @acceptance("PRIV-04")
    def test_draft_export_is_denied_audited_and_returns_no_bytes(self):
        self.freeze()
        response = self.export("pdf")
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["error_code"], "NOT_RELEASED")
        self.assertNotIn(b"%PDF", response.content)
        journal = JobStore(Path(self.temp.name) / "audit.db")
        try:
            actions = [row["action"] for row in journal.audit_events()]
        finally:
            journal.close()
        self.assertIn("report.export_denied", actions)

    @acceptance("PRIV-04")
    def test_client_cannot_supply_checks_or_skip_review(self):
        self.freeze()
        rec = self.store.get("rep1", "1")
        forged = self.client.post("/v1/reports/rep1/review",
                                  json={"version": "1", "decision": "approve",
                                        "report_ast_sha256": rec.ast_sha256, "checks": CHECKS,
                                        "status": "published"},
                                  headers={"Authorization": self.token("rev-stat", ["statistical_reviewer"])})
        self.assertEqual(forged.status_code, 422, forged.text)
        # A reviewer role cannot publish, and an unapproved version cannot be published even by the authority.
        self.assertEqual(self.publish(role="release_reviewer").status_code, 403)
        self.assertEqual(self.publish().status_code, 409)
        self.assertEqual(self.store.get("rep1", "1").status, "awaiting_review")

    def test_stale_ast_hash_is_refused_before_any_signature(self):
        self.freeze()
        stale = self.review("rev-stat", "statistical_reviewer", report_ast_sha256="0" * 64)
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["error_code"], "REPORT_CHANGED")
        self.assertEqual(self.store.get("rep1", "1").signatures, ())
        self.assertEqual(self.store.get("rep1", "1").status, "awaiting_review")

    def test_author_cannot_review_and_low_assurance_cannot_sign(self):
        self.freeze()
        own = self.review("analyst", "statistical_reviewer")
        self.assertEqual(own.status_code, 403, own.text)
        low = self.review("rev-stat", "statistical_reviewer", aal="aal1")
        self.assertEqual(low.status_code, 403, low.text)
        self.assertEqual(self.store.get("rep1", "1").status, "awaiting_review")

    def test_one_reviewer_cannot_publish_alone(self):
        self.freeze()
        response = self.review("rev-stat", "statistical_reviewer")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "qa_failed")
        self.assertEqual(self.store.get("rep1", "1").status, "qa_failed")
        self.assertEqual(self.publish().status_code, 409)          # not approved

    @acceptance("OPS-04")
    def test_full_review_publishes_and_all_formats_carry_the_same_ast(self):
        rec = self.freeze()
        approved = self.approve_all()
        self.assertEqual(approved.json()["status"], "approved")
        self.assertEqual(approved.json()["decision"]["status"], "publish")
        published = self.publish()
        self.assertEqual(published.status_code, 200, published.text)
        for fmt, marker in (("html", b"data-claim-id='c1'"), ("pdf", b"%PDF"), ("xlsx", b"PK"),
                            ("json", b'"ast_sha256"')):
            with self.subTest(fmt=fmt):
                response = self.export(fmt)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertIn(marker, response.content)
                self.assertEqual(response.headers["X-Report-Ast-Sha256"], rec.ast_sha256)
        html = self.export("html").content
        extracted = report.extract_html(html)
        self.assertEqual(extracted["claim_ids"], ["c1"])
        self.assertEqual(extracted["ast_sha256"], rec.ast_sha256)
        stored = json.loads(self.export("json").content)
        self.assertEqual(stored["ast_sha256"], rec.ast_sha256)
        self.assertEqual([c["claim_id"] for s in stored["sections"] for c in s["claims"]], ["c1"])

    @acceptance("OPS-14")
    def test_superseded_version_is_not_exportable(self):
        self.freeze("1")
        self.approve_all("1")
        self.assertEqual(self.publish(version="1").status_code, 200)
        self.freeze("2")
        self.approve_all("2")
        self.assertEqual(self.publish(version="2").status_code, 200)
        stale = self.export("pdf", version="1")
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["error_code"], "SUPERSEDED")
        self.assertEqual(self.export("pdf", version="2").status_code, 200)

    @acceptance("PRIV-07")
    def test_district_scope_and_cross_tenant_are_enforced_on_export(self):
        self.freeze()
        self.approve_all()
        self.publish()
        self.assertEqual(self.export("pdf", districts=("Muhanga",)).status_code, 403)
        self.assertEqual(self.export("pdf", tenant="tenant-b").status_code, 404)
        self.assertEqual(self.export("pdf", subject="stranger", role="nisr_analyst",
                                     districts=("Kamonyi",)).status_code, 200)

    def test_failed_check_blocks_publication_and_report_stays_draft(self):
        self.freeze(checks=dict(CHECKS, privacy_and_disclosure_clearance=False))
        self.approve_all()
        self.assertEqual(self.store.get("rep1", "1").status, "qa_failed")
        self.assertEqual(self.publish().status_code, 409)
        self.assertEqual(self.export("html").status_code, 403)

    def test_unauthenticated_unknown_version_and_bad_format(self):
        self.assertEqual(self.client.get("/v1/reports/rep1/export",
                                         params={"version": "1", "format": "pdf"}).status_code, 401)
        self.assertEqual(self.export("pdf").status_code, 404)
        self.freeze()
        self.approve_all()
        self.publish()
        self.assertEqual(self.export("csv").status_code, 422)


if __name__ == "__main__":
    unittest.main()
