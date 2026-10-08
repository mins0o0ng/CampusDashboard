"""
SQLite 데이터 계층 — 시간표·투표 영속 저장.

표준 라이브러리(sqlite3)만 사용해 의존성을 최소화한다.
스키마는 첫 커넥션에서 자동 보장(idempotent)되어 import 타이밍과 무관하게 안전하다.
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, timedelta
from typing import Iterator

DB_PATH = os.environ.get("CAMPUS_DB", os.path.join(os.path.dirname(__file__), "..", "campus.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS classes (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL,
    subject   TEXT NOT NULL,
    room      TEXT,
    day       INTEGER NOT NULL,
    start     REAL NOT NULL,
    end       REAL NOT NULL,
    color     TEXT NOT NULL DEFAULT 'indigo'
);
CREATE INDEX IF NOT EXISTS idx_classes_user ON classes(user_id);

CREATE TABLE IF NOT EXISTS polls (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    owner     TEXT NOT NULL,
    total     INTEGER NOT NULL DEFAULT 0,
    deadline  TEXT NOT NULL,
    multiple  INTEGER NOT NULL DEFAULT 0,   -- 1 이면 복수 선택 허용
    created_by TEXT
);

CREATE TABLE IF NOT EXISTS poll_options (
    id        TEXT PRIMARY KEY,
    poll_id   TEXT NOT NULL REFERENCES polls(id),
    label     TEXT NOT NULL,
    seq       INTEGER NOT NULL DEFAULT 0
);

-- 한 사람이 같은 선택지에 두 번 투표할 수는 없다. 단일/복수 선택 제한은 API 에서 검사한다.
CREATE TABLE IF NOT EXISTS votes (
    poll_id   TEXT NOT NULL,
    option_id TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    PRIMARY KEY (poll_id, user_id, option_id)
);
"""

SEED_POLL = {
    "id": "festival-2026",
    "title": "축제 초청 가수 투표",
    "owner": "학생회",
    "total": 32,
    # 고정 날짜는 시간이 지나면 마감 상태가 되어 투표·테스트가 깨진다 → 오늘 기준 상대 날짜
    "deadline": (date.today() + timedelta(days=14)).isoformat(),
    "options": [("o1", "데이식스"), ("o2", "아이브"), ("o3", "잔나비")],
}

_schema_ready = False


def _migrate(conn: sqlite3.Connection) -> None:
    """복수 선택 도입 이전 DB 를 현재 스키마로 맞춘다(idempotent)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(polls)")}
    if "multiple" not in cols:
        conn.execute("ALTER TABLE polls ADD COLUMN multiple INTEGER NOT NULL DEFAULT 0")
    if "created_by" not in cols:
        conn.execute("ALTER TABLE polls ADD COLUMN created_by TEXT")
    # 구버전 votes 는 PK 가 (poll_id, user_id) 라 복수 선택을 저장할 수 없다 → 테이블 재생성
    pk = [r[1] for r in sorted(conn.execute("PRAGMA table_info(votes)"), key=lambda r: r[5]) if r[5] > 0]
    if pk == ["poll_id", "user_id"]:
        conn.executescript(
            """
            ALTER TABLE votes RENAME TO votes_old;
            CREATE TABLE votes (
                poll_id TEXT NOT NULL, option_id TEXT NOT NULL, user_id TEXT NOT NULL,
                PRIMARY KEY (poll_id, user_id, option_id)
            );
            INSERT INTO votes SELECT poll_id, option_id, user_id FROM votes_old;
            DROP TABLE votes_old;
            """
        )


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """스키마 + 시드 보장(idempotent)."""
    conn.executescript(SCHEMA)
    _migrate(conn)
    exists = conn.execute("SELECT 1 FROM polls WHERE id = ?", (SEED_POLL["id"],)).fetchone()
    if not exists:
        conn.execute(
            "INSERT INTO polls(id, title, owner, total, deadline) VALUES(?,?,?,?,?)",
            (SEED_POLL["id"], SEED_POLL["title"], SEED_POLL["owner"], SEED_POLL["total"], SEED_POLL["deadline"]),
        )
        for seq, (oid, label) in enumerate(SEED_POLL["options"]):
            conn.execute(
                "INSERT INTO poll_options(id, poll_id, label, seq) VALUES(?,?,?,?)",
                (oid, SEED_POLL["id"], label, seq),
            )
    conn.commit()


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """행을 dict처럼 다루는 커넥션. 첫 호출 시 스키마 자동 보장."""
    global _schema_ready
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if not _schema_ready:
        _ensure_schema(conn)
        _schema_ready = True
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """명시적 초기화 — 첫 커넥션을 열어 스키마를 보장."""
    with get_conn():
        pass
