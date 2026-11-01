"""Durable report repository: frozen ASTs, independent review, publication and authorised exports.

This is the EP-08/EP-14 boundary. A report is created once from a governed pipeline (frozen AST +
server-computed release checks), reviewed by independent reviewers whose signatures are recorded
server-side, published by the publication authority, and only then rendered. There is no route that
renders a draft, and no client-supplied field can set a check, a signature or a status.

SQLite is the local adapter behind the same interface a Postgres deployment implements.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import contracts, release_gate, report
from .profiles import get_config, ProfileConfig
from .sqlite_support import enable_wal

SCHEMA = """
CREATE TABLE IF NOT EXISTS reports(
  report_id TEXT NOT NULL, version TEXT NOT NULL,
  document TEXT NOT NULL, ast TEXT NOT NULL, ast_sha256 TEXT NOT NULL,
  author TEXT NOT NULL, geography TEXT NOT NULL, tenant TEXT NOT NULL,
  status TEXT NOT NULL, checks TEXT NOT NULL, flags TEXT NOT NULL,
  signatures TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL,
  PRIMARY KEY(report_id, version));
CREATE TABLE IF NOT EXISTS report_current(
  report_id TEXT PRIMARY KEY, version TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS report_artifacts(
  report_id TEXT NOT NULL, version TEXT NOT NULL, format TEXT NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY(report_id, version, format));
"""

REVIEW_ROLES = frozenset(release_gate.REQUIRED_ROLES)
DEMO_REVIEW_ROLES = frozenset({"statistical_reviewer", "privacy_reviewer", "release_reviewer", "test-statistician", "test-privacy-officer", "test-release-authority"})
PUBLISH_ROLES = frozenset({"publication_authority", "release_reviewer"})
DEMO_PUBLISH_ROLES = frozenset({"publication_authority", "release_reviewer", "test-release-authority"})
FORMATS = {"html": "text/html; charset=utf-8", "pdf": "application/pdf",
           "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
           "json": "application/json; charset=utf-8"}


def _render_json(ast: dict) -> bytes:
    """Canonical JSON artifact: the frozen AST itself, exactly as hashed."""
    report.validate_snapshot(ast)
    return json.dumps(ast, sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8")


RENDERERS = {"html": report.render_html, "pdf": report.render_pdf,
             "xlsx": report.render_xlsx, "json": _render_json}


class ReportAccessDenied(PermissionError):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code


@dataclass(frozen=True)
class ReportRecord:
    report_id: str
    version: str
    document: dict
    ast: dict
    ast_sha256: str
    author: str
    geography: str
    tenant: str
    status: str
    checks: dict
    flags: frozenset
    signatures: tuple


def _row(rec) -> ReportRecord:
    return ReportRecord(rec["report_id"], rec["version"], json.loads(rec["document"]), json.loads(rec["ast"]),
                        rec["ast_sha256"], rec["author"], rec["geography"], rec["tenant"], rec["status"],
                        json.loads(rec["checks"]), frozenset(json.loads(rec["flags"])),
                        tuple(json.loads(rec["signatures"])))


class ReportStore:
    def __init__(self, path, clock: Callable[[], float] = time.time):
        self.path = str(path)
        self.clock = clock
        self._local = threading.local()
        con = self._db()
        # A cold file can be initialised by two requests at once; retry only the
        # transient lock report instead of surfacing a 500 on first load.
        for attempt in range(6):
            try:
                con.executescript(SCHEMA)
                con.commit()
                break
            except sqlite3.OperationalError as exc:
                if 'locked' not in str(exc) and 'busy' not in str(exc):
                    raise
                if attempt == 5:
                    raise
                time.sleep(0.05 * (2 ** attempt))

    def _db(self):
        con = getattr(self._local, "con", None)
        if con is None:
            con = sqlite3.connect(self.path, timeout=30)
            con.row_factory = sqlite3.Row
            enable_wal(con)
            con.execute("PRAGMA foreign_keys=ON")
            self._local.con = con
        return con

    def close(self):
        con = getattr(self._local, "con", None)
        if con is not None:
            con.close()
            self._local.con = None

    # ---- lifecycle ---------------------------------------------------------------------------
    def create(self, document: dict, ast: dict, author_id: str, geography: str, tenant: str,
               checks: dict, flags=()) -> ReportRecord:
        """Freeze a report produced by the governed pipeline. `checks` are computed server-side."""
        contracts.validate("report-document", document)
        report.validate_snapshot(ast)
        if ast.get("report_id") != document["report_id"] or ast.get("version") != document["report_version"]:
            raise ValueError("AST identity does not match the report document")
        if not isinstance(checks, dict) or not all(isinstance(v, bool) for v in checks.values()):
            raise ValueError("release checks must be server-computed booleans")
        known = set(release_gate.load_policy()["required"])
        if not set(checks) <= known:
            raise ValueError("unknown release checks")
        con = self._db()
        try:
            con.execute("INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (document["report_id"], document["report_version"], json.dumps(document, sort_keys=True),
                         json.dumps(ast, sort_keys=True), ast["ast_sha256"], author_id, geography, tenant,
                         "awaiting_review", json.dumps(checks, sort_keys=True), json.dumps(sorted(flags)),
                         json.dumps([]), self.clock(), self.clock()))
            con.commit()
        except sqlite3.IntegrityError:
            con.rollback()
            raise ValueError("report version already exists and is immutable") from None
        return self.get(document["report_id"], document["report_version"])

    def get(self, report_id: str, version: str) -> ReportRecord:
        row = self._db().execute("SELECT * FROM reports WHERE report_id=? AND version=?",
                                 (report_id, version)).fetchone()
        if row is None:
            raise ReportAccessDenied("NOT_FOUND")
        return _row(row)

    def review(self, report_id: str, version: str, reviewer_id: str, roles, action: str,
               reason: str = "", checks: dict | None = None, profile: ProfileConfig = None) -> release_gate.Decision:
        """Record one independent reviewer signature and re-evaluate the release gate.

        `checks` may only be refined by the server pipeline; HTTP callers never supply it.
        """
        if action not in ("approve", "reject"):
            raise ValueError("review action must be approve or reject")
        review_roles = DEMO_REVIEW_ROLES if (profile and profile.name.value == "HACKATHON_DEMO") else REVIEW_ROLES
        bypass = bool(profile and profile.bypass_human_approvals)
        held = review_roles.intersection(roles)
        if bypass:
            # Demo freedom: any signed-in role may record the review signature.
            role = next(iter(held)) if held else (sorted(roles)[0] if roles else "reviewer")
        else:
            if len(held) != 1:
                raise ReportAccessDenied("AMBIGUOUS_ROLE", "a reviewer must hold exactly one review role")
            role = next(iter(held))
        rec = self.get(report_id, version)
        if rec.status in ("published", "superseded", "revoked"):
            raise ReportAccessDenied("IMMUTABLE", f"report is {rec.status}")
        if reviewer_id == rec.author and not bypass:
            raise ReportAccessDenied("FORBIDDEN", "author cannot sign their own report")
        con = self._db()
        if action == "reject":
            con.execute("UPDATE reports SET status=?, updated=? WHERE report_id=? AND version=?",
                        ("qa_failed", self.clock(), report_id, version))
            con.commit()
            return release_gate.Decision("deny", (f"rejected by {role}: {reason}".strip(),))
        signatures = [s for s in rec.signatures if s["reviewer_id"] != reviewer_id]
        signatures.append({"reviewer_id": reviewer_id, "role": role, "at": self.clock()})
        effective = dict(rec.checks, **(checks or {}))
        decision = release_gate.evaluate(effective, set(rec.flags), signatures, rec.author, profile=profile)
        status = {"publish": "approved", "restricted_draft": "restricted_draft", "deny": "qa_failed"}[decision.status]
        # A single signature alone cannot publish: the gate already requires all three roles.
        con.execute("UPDATE reports SET status=?, signatures=?, updated=? WHERE report_id=? AND version=?",
                    (status, json.dumps(signatures), self.clock(), report_id, version))
        con.commit()
        return decision

    def publish(self, report_id: str, version: str, publisher_id: str, roles,
                artifacts=None, profile: ProfileConfig = None) -> None:
        publish_roles = DEMO_PUBLISH_ROLES if (profile and profile.name.value == "HACKATHON_DEMO") else PUBLISH_ROLES
        if profile and profile.bypass_human_approvals:
            publish_roles = publish_roles | {"nisr_analyst", "platform_admin"}
        if not publish_roles.intersection(roles):
            raise ReportAccessDenied("FORBIDDEN", "publication authority required")
        rec = self.get(report_id, version)
        if rec.status == "published":
            return
        if rec.status != "approved":
            raise ReportAccessDenied("NOT_APPROVED", f"status is {rec.status}")
        # Artifacts are written before the status flip: an outage leaves the report approved,
        # never published-without-bytes, and no partial object survives a failed write.
        stored = {}
        if artifacts is not None:
            for fmt in ("html", "pdf", "xlsx", "json"):
                info = artifacts.put(RENDERERS[fmt](rec.ast), namespace="reports", content_type=FORMATS[fmt])
                stored[fmt] = info["sha256"]
        con = self._db()
        previous = con.execute("SELECT version FROM report_current WHERE report_id=?", (report_id,)).fetchone()
        if previous and previous["version"] != version:
            con.execute("UPDATE reports SET status='superseded', updated=? WHERE report_id=? AND version=?",
                        (self.clock(), report_id, previous["version"]))
        con.execute("UPDATE reports SET status='published', updated=? WHERE report_id=? AND version=?",
                    (self.clock(), report_id, version))
        con.execute("INSERT INTO report_current(report_id, version) VALUES (?,?) "
                    "ON CONFLICT(report_id) DO UPDATE SET version=excluded.version", (report_id, version))
        con.commit()

    def revoke(self, report_id: str, version: str, roles) -> None:
        if "release_reviewer" not in roles:
            raise ReportAccessDenied("FORBIDDEN", "revocation requires release_reviewer")
        con = self._db()
        con.execute("UPDATE reports SET status='revoked', updated=? WHERE report_id=? AND version=?",
                    (self.clock(), report_id, version))
        con.commit()

    # ---- access ------------------------------------------------------------------------------
    def authorise_export(self, report_id: str, version: str, principal) -> ReportRecord:
        rec = self.get(report_id, version)
        if principal.tenant != rec.tenant:
            raise ReportAccessDenied("NOT_FOUND", "cross-tenant")     # indistinguishable from absent
        if principal.districts and rec.geography not in principal.districts:
            raise ReportAccessDenied("FORBIDDEN", "district scope")
        if rec.status == "superseded":
            raise ReportAccessDenied("SUPERSEDED", "a newer version exists")
        if rec.status == "revoked":
            raise ReportAccessDenied("REVOKED")
        if rec.status != "published":
            raise ReportAccessDenied("NOT_RELEASED", f"status is {rec.status}")
        try:
            report.validate_snapshot(rec.ast)
        except ValueError:
            raise ReportAccessDenied("INTEGRITY", "AST hash mismatch") from None
        if rec.ast["ast_sha256"] != rec.ast_sha256:
            raise ReportAccessDenied("INTEGRITY", "stored hashes disagree")
        return rec

    def export(self, report_id: str, version: str, principal, fmt: str, artifacts=None,
               profile: ProfileConfig = None) -> tuple[bytes, str]:
        rec = self.authorise_export(report_id, version, principal)
        if fmt not in FORMATS:
            raise ValueError("unsupported format")
        if artifacts is not None:
            row = self._db().execute(
                "SELECT sha256 FROM report_artifacts WHERE report_id=? AND version=? AND format=?",
                (report_id, version, fmt)).fetchone()
            if row is not None:
                # Served from the content-addressed artifact written at publication time.
                return artifacts.get(row["sha256"], namespace="reports"), FORMATS[fmt]
        rendered = RENDERERS[fmt](rec.ast)
        # Add demonstration label for hackathon demo exports
        if profile and profile.allow_demonstration_exports and profile.demonstration_label:
            # Add watermark/header to rendered content
            if fmt == "json":
                import json
                data = json.loads(rendered)
                data["_demonstration_label"] = profile.demonstration_label
                rendered = json.dumps(data, sort_keys=True, indent=2, ensure_ascii=False).encode("utf-8")
            elif fmt in ("html", "pdf", "xlsx"):
                # For non-JSON formats, prepend a header
                prefix = f"{profile.hackathon_label}: {profile.demonstration_label}\n\n".encode("utf-8")
                rendered = prefix + rendered
        return rendered, FORMATS[fmt]