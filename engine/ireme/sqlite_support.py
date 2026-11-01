"""SQLite helper shared by the governed stores.

Journal mode is a durable property of the database file: once any connection has
switched it to WAL, every later connection inherits it. Two cold opens at the
same time can therefore make the ``journal_mode`` pragma report BUSY even though
the caller's own statement would have succeeded, so the switch is retried
briefly and then skipped rather than failing a request over it.
"""
from __future__ import annotations

import sqlite3
import time


def enable_wal(con: sqlite3.Connection) -> None:
    """Make a best effort to switch ``con`` to WAL, tolerating a concurrent open."""
    for attempt in range(5):
        try:
            con.execute("PRAGMA journal_mode=WAL")
            return
        except sqlite3.OperationalError as exc:
            if "locked" not in str(exc) and "busy" not in str(exc):
                raise
            if attempt == 4:
                return
            time.sleep(0.05 * (2**attempt))
