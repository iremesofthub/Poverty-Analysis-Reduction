import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from acceptance import acceptance  # noqa: E402
from ireme import data_eicv7, jobs, survey as sv  # noqa: E402

ENGINE = Path(__file__).resolve().parents[1]
ROOT = ENGINE.parent


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "jobs.db"
        self.stores = []
        self.store = self.open(self.db)

    def open(self, path):
        s = jobs.JobStore(path)
        self.stores.append(s)
        return s

    def tearDown(self):
        for s in self.stores:
            s.close()
        self.tmp.cleanup()


CRASH_SCRIPT = r"""
import sys, os
sys.path.insert(0, {engine!r})
from ireme import jobs
store = jobs.JobStore({db!r})
rid = store.submit("district", {{"district": "Kamonyi"}}, "idem-crash", "w1")
counter = {counter!r}
def bump(name):
    with open(counter, "a") as f: f.write(name + "\n")
def s1(p, up): bump("s1"); return {{"a": 1}}
def s2(p, up):
    bump("s2")
    if os.environ.get("CRASH") == "1":
        os._exit(77)            # hard kill: no cleanup, no exception handling
    return {{"b": up["s1"]["a"] + 1}}
def s3(p, up): bump("s3"); return {{"c": up["s2"]["b"] + 1}}
out = store.execute(rid, [("s1", s1, None), ("s2", s2, None), ("s3", s3, None)])
print(out["outputs"]["s3"]["c"])
"""


class Durability(Base):
    @acceptance("OPS-01")
    def test_worker_killed_mid_run_resumes_from_checkpoint(self):
        counter = Path(self.tmp.name) / "counter.txt"
        script = Path(self.tmp.name) / "worker.py"
        script.write_text(CRASH_SCRIPT.format(engine=str(ENGINE), db=str(self.db), counter=str(counter)))
        r1 = subprocess.run([sys.executable, str(script)], env={**os.environ, "CRASH": "1"}, capture_output=True)
        self.assertEqual(r1.returncode, 77, r1.stderr.decode()[-600:])
        self.assertEqual(counter.read_text().split(), ["s1", "s2"])
        r2 = subprocess.run([sys.executable, str(script)], env={**os.environ, "CRASH": "0"}, capture_output=True, text=True)
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertEqual(r2.stdout.strip(), "3")
        self.assertEqual(counter.read_text().split(), ["s1", "s2", "s2", "s3"])   # s1 NOT recomputed
        ok, bad = self.open(self.db).verify_audit()
        self.assertTrue(ok, bad)

    @acceptance("OPS-02")
    def test_duplicate_submission_is_idempotent_and_conflicting_reuse_rejected(self):
        a = self.store.submit("district", {"district": "Kamonyi"}, "k1", "w1")
        b = self.store.submit("district", {"district": "Kamonyi"}, "k1", "w1")
        self.assertEqual(a, b)
        n = self.store.conn().execute("SELECT COUNT(*) FROM runs").fetchone()[0]
        self.assertEqual(n, 1)
        with self.assertRaises(jobs.IdempotencyConflict):
            self.store.submit("district", {"district": "Muhanga"}, "k1", "w1")
        calls = []
        st = [("s", lambda p, u: calls.append(1) or {"v": 1}, None)]
        self.store.execute(a, st)
        self.store.execute(b, st)
        self.assertEqual(len(calls), 1)                      # second execution is a replay, not a recomputation

    @acceptance("OPS-03")
    def test_source_outage_run_replays_to_completion_when_source_returns(self):
        state = {"up": False}

        def fetch(p, u):
            if not state["up"]:
                raise ConnectionError("source down")
            return {"sha": "abc"}
        rid = self.store.submit("district", {"d": "Kamonyi"}, "k-outage", "w1")
        stages = [("prep", lambda p, u: {"n": 1}, None), ("fetch", fetch, None), ("verify", lambda p, u: {"ok": u["fetch"]["sha"]}, None)]
        with self.assertRaises(ConnectionError):
            self.store.execute(rid, stages)
        self.assertEqual(self.store.run_info(rid)["status"], "failed")
        failed_event = next(event for event in self.store.audit_events() if event["action"] == "stage.failed")
        self.assertEqual(failed_event["detail"]["error_type"], "ConnectionError")
        self.assertNotIn("source down", str(failed_event["detail"]))
        state["up"] = True
        out = self.store.execute(rid, stages)
        self.assertEqual(out["skipped"], ["prep"])
        self.assertEqual(out["ran"], ["fetch", "verify"])
        self.assertEqual(self.store.run_info(rid)["status"], "complete")

    @acceptance("OPS-06")
    def test_source_change_invalidates_dependent_stages_only(self):
        src = {"sha": "v1"}
        rid = self.store.submit("district", {"d": "K"}, "k-src", "w1")
        runs = []
        stages = [("load", lambda p, u: runs.append("load") or {"n": 1}, None),
                  ("verify", lambda p, u: runs.append("verify") or {"ref": src["sha"]}, lambda p: {"source_sha": src["sha"]}),
                  ("report", lambda p, u: runs.append("report") or {"r": u["verify"]["ref"]}, None)]
        self.store.execute(rid, stages)
        self.store.execute(rid, stages)
        self.assertEqual(runs, ["load", "verify", "report"])
        src["sha"] = "v2"                                     # official publication revised
        out = self.store.execute(rid, stages)
        self.assertEqual(out["ran"], ["verify", "report"])
        self.assertEqual(out["skipped"], ["load"])
        self.assertEqual(out["outputs"]["report"]["r"], "v2")

    @acceptance("OPS-07")
    def test_model_release_change_reruns_narrative_but_not_statistics(self):
        model = {"id": "groq/gpt-oss-120b@2026-10"}
        rid = self.store.submit("district", {"d": "K"}, "k-model", "w1")
        runs = []
        stages = [("stats", lambda p, u: runs.append("stats") or {"x": 1}, None),
                  ("narrative", lambda p, u: runs.append("narr") or {"m": model["id"]}, lambda p: {"model": model["id"]})]
        self.store.execute(rid, stages)
        model["id"] = "groq/gpt-oss-120b@2026-11"
        out = self.store.execute(rid, stages)
        self.assertEqual(out["ran"], ["narrative"])
        self.assertEqual(runs, ["stats", "narr", "narr"])

    @acceptance("OPS-15")
    def test_same_inputs_give_identical_trace_hash_and_changed_inputs_differ(self):
        def go(db_name, d):
            s = self.open(Path(self.tmp.name) / db_name)
            rid = s.submit("district", {"d": d}, "k", "w1")
            return s.execute(rid, [("a", lambda p, u: {"v": p["d"].upper()}, None), ("b", lambda p, u: {"w": u["a"]["v"] * 2}, None)])["trace_hash"]
        self.assertEqual(go("x.db", "kamonyi"), go("y.db", "kamonyi"))
        self.assertNotEqual(go("x2.db", "kamonyi"), go("y2.db", "muhanga"))

    @acceptance("OPS-16")
    def test_runs_are_pinned_to_their_worker_version_and_rollback_keeps_them_resumable(self):
        v1 = [("s", lambda p, u: {"impl": "v1"}, None)]
        v2 = [("s", lambda p, u: {"impl": "v2"}, None)]
        registry = {"w1": v1, "w2": v2}
        active = {"v": "w2"}
        r_new = self.store.submit("district", {"d": "A"}, "k-a", active["v"])
        self.assertEqual(self.store.execute(r_new, registry[self.store.run_info(r_new)["worker_version"]])["outputs"]["s"]["impl"], "v2")
        active["v"] = "w1"                                    # operator rolls the fleet back
        r_after = self.store.submit("district", {"d": "B"}, "k-b", active["v"])
        self.assertEqual(self.store.execute(r_after, registry[self.store.run_info(r_after)["worker_version"]])["outputs"]["s"]["impl"], "v1")
        # the earlier w2 run is still pinned to w2 and replays with w2 code, not silently with w1
        self.assertEqual(self.store.run_info(r_new)["worker_version"], "w2")
        self.assertEqual(self.store.execute(r_new, registry["w2"])["skipped"], ["s"])


class AuditAndStorage(Base):
    @acceptance("OPS-11")
    def test_audit_log_tampering_is_detected_at_the_exact_record(self):
        for i in range(5):
            self.store.log("alice", "report.view", {"i": i})
        self.assertEqual(self.store.verify_audit(), (True, None))
        c = sqlite3.connect(self.db)
        c.execute("UPDATE audit SET actor='mallory' WHERE seq=3")
        c.commit(); c.close()
        ok, seq = self.store.verify_audit()
        self.assertFalse(ok)
        self.assertEqual(seq, 3)
        c = sqlite3.connect(self.db)
        c.execute("UPDATE audit SET actor='alice' WHERE seq=3")
        c.execute("DELETE FROM audit WHERE seq=2")             # deletion also breaks the chain
        c.commit(); c.close()
        self.assertFalse(self.store.verify_audit()[0])

    @acceptance("PRIV-12")
    def test_audit_never_stores_secrets(self):
        self.store.log("worker", "provider.error", {"msg": "Authorization: Bearer gsk_ABCDEFGHIJKLMNOPQRSTUVWX failed",
                                                     "api_key": "api_key=sk-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"})
        raw = json.dumps(self.store.conn().execute("SELECT detail FROM audit").fetchall())
        self.assertNotIn("gsk_ABCDEFGHIJKLMNOPQRSTUVWX", raw)
        self.assertNotIn("sk-AAAA", raw)

    @acceptance("OPS-12")
    def test_schema_migration_preserves_old_data_and_refuses_newer_schema(self):
        old = Path(self.tmp.name) / "old.db"
        c = sqlite3.connect(old)
        c.executescript(jobs.MIGRATIONS[1] + "CREATE TABLE schema_version(v INTEGER NOT NULL); INSERT INTO schema_version VALUES (1);")
        c.execute("INSERT INTO runs VALUES ('run-old','k-old','district','{\"d\":\"A\"}','w0','complete',1.0)")
        c.commit(); c.close()
        s = self.open(old)                                     # opens a v1 database and migrates it forward
        row = s.conn().execute("SELECT run_id, priority FROM runs").fetchone()
        self.assertEqual(row, ("run-old", 0))
        self.assertEqual(s.conn().execute("SELECT MAX(v) FROM schema_version").fetchone()[0], jobs.SCHEMA_VERSION)
        s.conn().execute("INSERT INTO schema_version VALUES (99)")
        with self.assertRaises(jobs.SchemaTooNew):
            self.open(old)

    @acceptance("OPS-08")
    def test_backup_restore_verifies_integrity_and_audit_chain(self):
        rid = self.store.submit("district", {"d": "K"}, "k-bk", "w1")
        self.store.execute(rid, [("s", lambda p, u: {"x": 1}, None)])
        bk = Path(self.tmp.name) / "backup.db"
        sha = self.store.backup(bk)
        restored = jobs.restore(bk, Path(self.tmp.name) / "restored.db", sha)
        self.stores.append(restored)
        self.assertEqual(restored.run_info(rid)["status"], "complete")
        self.assertTrue(restored.verify_audit()[0])
        with self.assertRaises(ValueError):
            jobs.restore(bk, Path(self.tmp.name) / "r2.db", "0" * 64)
        data = bytearray(bk.read_bytes()); data[-200] ^= 0xFF; bk.write_bytes(bytes(data))
        with self.assertRaises(ValueError):
            jobs.restore(bk, Path(self.tmp.name) / "r3.db", sha)


@unittest.skipUnless(data_eicv7.available(), "licensed EICV7 data required")
class ConcurrentDistricts(Base):
    @acceptance("OPS-13", evidence="real")
    def test_30_real_districts_run_concurrently_under_a_global_cap(self):
        frame, _ = data_eicv7.load_eicv7()
        design, y = data_eicv7.person_design(frame), data_eicv7.poor_indicator(frame)
        districts = sorted(set(frame.district))
        active, peak, lock = 0, 0, threading.Lock()

        def job(d):
            def run():
                nonlocal active, peak
                rid = self.store.submit("district", {"district": d}, f"batch-{d}", "w1")

                def estimate(p, up):
                    nonlocal active, peak
                    with lock:
                        active += 1; peak = max(peak, active)
                    try:
                        e = sv.ratio_estimate(design, y, domain=(frame.district == p["district"]).to_numpy())
                        return {"district": p["district"], "poverty_pct": round(100 * e.point, 4), "se": round(100 * e.se, 4)}
                    finally:
                        with lock:
                            active -= 1
                out = self.store.execute(rid, [("estimate", estimate, None)])
                return out["outputs"]["estimate"]
            return run
        results = jobs.run_many([job(d) for d in districts], max_workers=4)
        self.assertLessEqual(peak, 4)
        self.assertEqual(sorted(r["district"] for r in results), districts)
        self.assertEqual(self.store.conn().execute("SELECT COUNT(*) FROM runs WHERE status='complete'").fetchone()[0], 30)
        self.assertTrue(self.store.verify_audit()[0])
        by = {r["district"]: r for r in results}
        self.assertAlmostEqual(by["Kamonyi"]["poverty_pct"], 39.7, places=1)     # concurrency did not corrupt results


class ColdOpen(unittest.TestCase):
    def test_parallel_cold_opens_do_not_fail_on_lock_contention(self):
        """The console reads runs while other discovery reads open the same file."""
        tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "jobs.db"
        errors = []
        opened = []
        lock = threading.Lock()
        start = threading.Barrier(4)

        def open_store():
            try:
                start.wait(timeout=10)
                store = jobs.JobStore(path)
                store.list_runs(10)
                store.close()
                with lock:
                    opened.append(True)
            except Exception as exc:  # noqa: BLE001 - the failure is the assertion
                with lock:
                    errors.append(exc)

        threads = [threading.Thread(target=open_store) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertEqual(errors, [])
        self.assertEqual(len(opened), 4)


if __name__ == "__main__":
    unittest.main()
