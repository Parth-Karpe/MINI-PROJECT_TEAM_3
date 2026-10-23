"""
Append-only audit trail, backed by SQLite (Python stdlib -- no new
dependency).

Why a real database instead of an in-memory list: an audit trail's whole
job is to survive the thing it's auditing going wrong -- a crash, a
dispute, an "explain why request R7 was rejected" months later. An
in-memory list dies with the process; a durable, indexed, queryable log
is a few sqlite3 calls away, so there's no good reason to settle for
less. This module also demonstrates two standard DB practices directly:
indexing the columns actually queried by, and parameterized queries
(never string-building SQL), which rules out SQL injection by
construction rather than by discipline.
"""
import json
import sqlite3


class AuditLog:
    def __init__(self, db_path: str = "audit_log.db"):
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                event_type TEXT NOT NULL,
                request_id TEXT,
                resource_id TEXT,
                user_id TEXT,
                details TEXT
            )
            """
        )
        # The two access patterns this system actually needs: "history of
        # this resource" and "history of this request" -- index exactly
        # those, not every column, to keep writes cheap.
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_id, ts)"
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_log(request_id, ts)"
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, ts)"
        )
        self._conn.commit()

    def log(
        self, event_type: str, *, ts: float,
        request_id: str | None = None, resource_id: str | None = None,
        user_id: str | None = None, details: dict | None = None,
    ) -> None:
        self._conn.execute(
            "INSERT INTO audit_log (ts, event_type, request_id, resource_id, user_id, details) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (ts, event_type, request_id, resource_id, user_id, json.dumps(details or {})),
        )
        self._conn.commit()

    def history_for_resource(self, resource_id: str, limit: int = 100) -> list[dict]:
        cur = self._conn.execute(
            "SELECT ts, event_type, request_id, user_id, details FROM audit_log "
            "WHERE resource_id = ? ORDER BY ts DESC LIMIT ?",
            (resource_id, limit),
        )
        return [self._row_to_dict(row) for row in cur.fetchall()]

    def history_for_request(self, request_id: str) -> list[dict]:
        cur = self._conn.execute(
            "SELECT ts, event_type, resource_id, user_id, details FROM audit_log "
            "WHERE request_id = ? ORDER BY ts ASC",
            (request_id,),
        )
        return [self._row_to_dict(row) for row in cur.fetchall()]

    def history_for_user(self, user_id: str, limit: int = 200) -> list[dict]:
        """FR-11: 'recommendations shall consider ... repeated resource
        usage' -- this is where that signal comes from: what has this
        user actually booked before?"""
        cur = self._conn.execute(
            "SELECT ts, event_type, request_id, resource_id, details FROM audit_log "
            "WHERE user_id = ? ORDER BY ts DESC LIMIT ?",
            (user_id, limit),
        )
        return [self._row_to_dict(row) for row in cur.fetchall()]

    def recent(self, limit: int = 100) -> list[dict]:
        """Unfiltered activity feed -- everything, newest first. What a
        dashboard's "what just happened" panel actually wants."""
        cur = self._conn.execute(
            "SELECT ts, event_type, request_id, resource_id, user_id, details FROM audit_log "
            "ORDER BY ts DESC, id DESC LIMIT ?",
            (limit,),
        )
        return [self._row_to_dict(row) for row in cur.fetchall()]

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict:
        d = dict(row)
        if d.get("details"):
            d["details"] = json.loads(d["details"])
        return d

    def close(self) -> None:
        self._conn.close()
