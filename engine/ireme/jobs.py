"""Durable, idempotent, checkpointed workflow store (EP-13) with a tamper-evident audit chain.

SQLite (WAL, transactional) is the reference store behind the same interface a Postgres deployment
implements. A stage is skipped only when a *completed* stage with the identical input hash exists, so
crash recovery, replay, source-change invalidation and model-release changes all reduce to input hashing.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Callable

from .gateway import redact
from .sqlite_support import enable_wal

SCHEMA_VERSION = 2
MIGRATIONS = {
    1: """CREATE TABLE runs(run_id TEXT PRIMARY KEY, idem_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL,
          params TEXT NOT NULL, worker_version TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL);
          CREATE TABLE stages(run_id TEXT NOT NULL, name TEXT NOT NULL, input_hash TEXT NOT NULL, output TEXT,
          output_hash TEXT, status TEXT NOT NULL, worker_version TEXT NOT NULL, finished REAL,
          PRIMARY KEY(run_id,name));
          CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, actor TEXT NOT NULL,
          action TEXT NOT NULL, detail TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);""",
    2: "ALTER TABLE runs ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;",
}
GENESIS = "0" * 64


def h(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


class IdempotencyConflict(ValueError):
    pass


class SchemaTooNew(RuntimeError):
    pass


class CheckpointIntegrityError(RuntimeError):
    pass


class JobStore:
    def __init__(self, path, clock: Callable[[], float] = time.time):
        self.path = str(path)
        self.clock = clock
        self._local = threading.local()
        self._all_conns = []
        self._conn_lock = threading.Lock()
        self._audit_lock = threading.Lock()
        try:
            self.migrate()
        except Exception:
            self.close()
            raise

    # ---- connection / migrations ---------------------------------------------------------------------
    def _connect(self) -> sqlite3.Connection:
        """Open a connection with the store's durability pragmas applied."""
        c = sqlite3.connect(self.path, timeout=30, isolation_level=None, check_same_thread=False)
        try:
            enable_wal(c)
            c.execute("PRAGMA synchronous=FULL")
        except Exception:
            c.close()
            raise
        return c

    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "c", None)
        if c is None:
            c = self._connect()
            self._local.c = c
            with self._conn_lock:
                self._all_conns.append(c)
        return c

    def close(self):
        for c in self._all_conns:
            try:
                c.close()
            except sqlite3.Error:
                pass
        self._all_conns.clear()
        self._local = threading.local()

    def migrate(self) -> int:
        c = self.conn()
        c.execute("CREATE TABLE IF NOT EXISTS schema_version(v INTEGER NOT NULL)")
        row = c.execute("SELECT MAX(v) FROM schema_version").fetchone()
        cur = row[0] or 0
        if cur > SCHEMA_VERSION:
            raise SchemaTooNew(f"database schema v{cur} is newer than this code (v{SCHEMA_VERSION})")
        for v in range(cur + 1, SCHEMA_VERSION + 1):
            c.execute("BEGIN IMMEDIATE")
            try:
                for stmt in filter(None, (s.strip() for s in MIGRATIONS[v].split(";"))):
                    c.execute(stmt)
                c.execute("INSERT INTO schema_version(v) VALUES (?)", (v,))
                c.execute("COMMIT")
            except Exception:
                c.execute("ROLLBACK")
                raise
        return SCHEMA_VERSION

    # ---- audit chain -------------------------------------------------------------------------------------
    def log(self, actor: str, action: str, detail: dict | None = None) -> str:
        """Append-only, hash-chained, secret-redacted audit record."""
        clean = json.loads(redact(json.dumps(detail or {}, default=str)))
        with self._audit_lock:
            c = self.conn()
            c.execute("BEGIN IMMEDIATE")
            try:
                prev = c.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
                prev_hash = prev[0] if prev else GENESIS
                ts = self.clock()
                digest = h([prev_hash, ts, actor, action, clean])
                c.execute("INSERT INTO audit(ts,actor,action,detail,prev_hash,hash) VALUES (?,?,?,?,?,?)",
                          (ts, actor, action, json.dumps(clean, sort_keys=True), prev_hash, digest))
                c.execute("COMMIT")
            except Exception:
                c.execute("ROLLBACK")
                raise
        return digest

    def verify_audit(self) -> tuple[bool, int | None]:
        prev = GENESIS
        for seq, ts, actor, action, detail, ph, hh in self.conn().execute(
                "SELECT seq,ts,actor,action,detail,prev_hash,hash FROM audit ORDER BY seq"):
            if ph != prev or hh != h([ph, ts, actor, action, json.loads(detail)]):
                return False, seq
            prev = hh
        return True, None

    def audit_events(self, limit: int = 200) -> list[dict]:
        """Read the durable audit chain, newest first (redacted detail only)."""
        rows = self.conn().execute(
            "SELECT seq,ts,actor,action,detail,hash FROM audit ORDER BY seq DESC LIMIT ?", (limit,))
        return [{"seq": r[0], "ts": r[1], "actor": r[2], "action": r[3],
                 "detail": json.loads(r[4]), "hash": r[5]} for r in rows]

    # ---- runs ----------------------------------------------------------------------------------------------
    def submit(self, kind: str, params: dict, idem_key: str, worker_version: str) -> str:
        c = self.conn()
        rid = "run-" + h([kind, idem_key])[:16]
        try:
            c.execute("INSERT INTO runs(run_id,idem_key,kind,params,worker_version,status,created) VALUES (?,?,?,?,?,?,?)",
                      (rid, idem_key, kind, json.dumps(params, sort_keys=True), worker_version, "queued", self.clock()))
            self.log("system", "run.submitted", {"run_id": rid, "kind": kind})
        except sqlite3.IntegrityError:
            old = c.execute("SELECT params,kind FROM runs WHERE idem_key=?", (idem_key,)).fetchone()
            if json.loads(old[0]) != params or old[1] != kind:
                raise IdempotencyConflict(f"idempotency key {idem_key!r} reused with different parameters") from None
            rid = c.execute("SELECT run_id FROM runs WHERE idem_key=?", (idem_key,)).fetchone()[0]
        return rid

    def list_runs(self, limit: int = 100) -> list[dict]:
        """Newest runs first. Callers must filter ownership before exposing anything.

        ``params`` is included for ownership checks only; the HTTP layer never
        returns it verbatim.
        """
        rows = self.conn().execute(
            "SELECT run_id,kind,params,status,created,worker_version FROM runs ORDER BY rowid DESC LIMIT ?",
            (max(1, min(int(limit), 500)),)).fetchall()
        return [{"run_id": r[0], "kind": r[1], "params": json.loads(r[2]), "status": r[3],
                 "created": r[4], "worker_version": r[5]} for r in rows]

    def run_info(self, rid: str) -> dict:
        r = self.conn().execute("SELECT run_id,kind,params,worker_version,status FROM runs WHERE run_id=?", (rid,)).fetchone()
        return {"run_id": r[0], "kind": r[1], "params": json.loads(r[2]), "worker_version": r[3], "status": r[4]}

    def stage_rows(self, rid: str) -> dict:
        return {r[0]: {"status": r[1], "input_hash": r[2], "output_hash": r[3], "worker_version": r[4]} for r in
                self.conn().execute("SELECT name,status,input_hash,output_hash,worker_version FROM stages WHERE run_id=?", (rid,))}

    def public_status(self, rid: str) -> dict | None:
        """Return workflow state only; never expose stored input parameters or stage outputs."""
        row = self.conn().execute("SELECT run_id,status,created FROM runs WHERE run_id=?", (rid,)).fetchone()
        if not row:
            return None
        stages = self.conn().execute("SELECT name,status FROM stages WHERE run_id=? ORDER BY rowid", (rid,)).fetchall()
        return {"run_id": row[0], "status": row[1], "created": row[2],
                "stages": [{"stage_id": name, "status": status} for name, status in stages]}

    def fail_before_stage(self, rid: str, error_type: str) -> None:
        """Mark preparation failures without persisting exception text or source data."""
        safe_type = error_type if error_type.isascii() and error_type.isalnum() else "WorkerError"
        self.conn().execute("UPDATE runs SET status='failed' WHERE run_id=? AND status!='complete'", (rid,))
        self.log("worker", "run.failed_before_stage", {"run_id": rid, "error_type": safe_type[:64]})

    def execute(self, rid: str, stages: list[tuple[str, Callable[[dict, dict], dict], Callable[[dict], dict] | None]],
                ) -> dict:
        """stages: [(name, fn(params, upstream_outputs)->dict, external_inputs(params)->dict|None)].
        external_inputs lets a stage declare things whose change must invalidate it (source hash, model id)."""
        info = self.run_info(rid)
        params, up, ran, skipped = info["params"], {}, [], []
        c = self.conn()
        c.execute("UPDATE runs SET status='running' WHERE run_id=?", (rid,))
        cascade = False
        for name, fn, ext in stages:
            ext_in = ext(params) if ext else {}
            in_hash = h([params, ext_in, {k: h(v) for k, v in up.items()}, info["worker_version"]])
            row = c.execute("SELECT input_hash,status,output,output_hash FROM stages WHERE run_id=? AND name=?", (rid, name)).fetchone()
            if row and row[1] == "done" and row[0] == in_hash and not cascade:
                try:
                    cached = json.loads(row[2])
                    if h(cached) != row[3]:
                        raise ValueError('checkpoint hash mismatch')
                except (ValueError, TypeError):
                    c.execute("UPDATE runs SET status='failed' WHERE run_id=?", (rid,))
                    self.log('worker', 'checkpoint.integrity_failed', {'run_id': rid, 'stage': name})
                    raise CheckpointIntegrityError('Stored checkpoint failed integrity verification') from None
                up[name] = cached
                skipped.append(name)
                continue
            cascade = True       # anything downstream of a re-run stage is recomputed
            try:
                out = fn(params, dict(up))
            except Exception as exc:
                c.execute("INSERT OR REPLACE INTO stages(run_id,name,input_hash,output,output_hash,status,worker_version,finished)"
                          " VALUES (?,?,?,?,?,?,?,?)", (rid, name, in_hash, None, None, "failed", info["worker_version"], self.clock()))
                c.execute("UPDATE runs SET status='failed' WHERE run_id=?", (rid,))
                # Exception messages can accidentally contain source values or paths.
                # Keep only a bounded type label in the audit chain.
                error_type = type(exc).__name__
                if not error_type.isascii() or not error_type.isalnum():
                    error_type = "WorkerError"
                self.log("worker", "stage.failed", {"run_id": rid, "stage": name,
                                                     "error_type": error_type[:64]})
                raise
            c.execute("BEGIN IMMEDIATE")           # stage result + status commit atomically
            c.execute("INSERT OR REPLACE INTO stages(run_id,name,input_hash,output,output_hash,status,worker_version,finished)"
                      " VALUES (?,?,?,?,?,?,?,?)", (rid, name, in_hash, json.dumps(out, sort_keys=True, default=str),
                                                    h(out), "done", info["worker_version"], self.clock()))
            c.execute("COMMIT")
            up[name] = out
            ran.append(name)
        c.execute("UPDATE runs SET status='complete' WHERE run_id=?", (rid,))
        self.log("worker", "run.complete", {"run_id": rid, "ran": ran, "skipped": skipped})
        return {"outputs": up, "ran": ran, "skipped": skipped,
                "trace_hash": h([{k: self.stage_rows(rid)[k]["output_hash"] for k in up}, info["worker_version"]])}

    # ---- backup / restore --------------------------------------------------------------------------------------
    def backup(self, dest) -> str:
        dest = Path(dest)
        src = self.conn()
        dst = sqlite3.connect(str(dest))
        src.backup(dst)
        dst.close()
        return hashlib.sha256(dest.read_bytes()).hexdigest()


def restore(backup_path, target_path, expected_sha256: str) -> "JobStore":
    data = Path(backup_path).read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError("backup failed integrity check (hash mismatch)")
    Path(target_path).write_bytes(data)
    store = JobStore(target_path)
    ok = store.conn().execute("PRAGMA integrity_check").fetchone()[0]
    chain_ok, bad = store.verify_audit()
    if ok != "ok" or not chain_ok:
        raise ValueError(f"restored database failed verification (integrity={ok}, audit break at {bad})")
    return store


def run_many(jobs: list[Callable[[], object]], max_workers: int) -> list:
    """Bounded concurrency (global cap) for multi-district batches."""
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        return list(ex.map(lambda f: f(), jobs))
