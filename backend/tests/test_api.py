"""
백엔드 API 통합 테스트 — TestClient(실제 네트워크 불필요).

검증 포인트:
- 시간표 CRUD + 사용자 격리(다른 user는 못 봄/못 지움)
- 투표 서버측 1인 1회 참여, 단일/복수 선택 제한, 취소 후 재투표, 마감 검사
"""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient

# 테스트용 임시 DB 로 격리
os.environ["CAMPUS_DB"] = os.path.join(tempfile.gettempdir(), "campus_test.db")
if os.path.exists(os.environ["CAMPUS_DB"]):
    os.remove(os.environ["CAMPUS_DB"])

from app.main import app  # noqa: E402

client = TestClient(app)
H = {"X-User-Id": "chunbae"}
H2 = {"X-User-Id": "someone-else"}


def test_timetable_crud_and_isolation():
    # 처음엔 비어있음
    assert client.get("/api/timetable", headers=H).json() == []

    # 추가
    r = client.post("/api/timetable", headers=H, json={"subject": "알고리즘", "day": 0, "start": 9, "end": 11})
    assert r.status_code == 201
    cid = r.json()["id"]

    # 조회됨
    assert len(client.get("/api/timetable", headers=H).json()) == 1

    # 다른 사용자에겐 안 보임(사용자 격리)
    assert client.get("/api/timetable", headers=H2).json() == []

    # 수정
    r = client.put(f"/api/timetable/{cid}", headers=H, json={"subject": "알고리즘(정정)", "day": 1, "start": 10, "end": 12, "color": "red"})
    assert r.status_code == 200 and r.json()["subject"] == "알고리즘(정정)"

    # 다른 사용자는 못 지움
    assert client.delete(f"/api/timetable/{cid}", headers=H2).status_code == 404

    # 본인은 삭제
    assert client.delete(f"/api/timetable/{cid}", headers=H).status_code == 204
    assert client.get("/api/timetable", headers=H).json() == []


def test_timetable_invalid_span():
    r = client.post("/api/timetable", headers=H, json={"subject": "X", "day": 0, "start": 11, "end": 9})
    assert r.status_code == 422


def test_vote_one_person_one_vote():
    pid = "festival-2026"
    # 최초 조회: 내 투표 없음
    p = client.get(f"/api/poll/{pid}", headers=H).json()
    assert p["votedOptionIds"] == []
    base = sum(o["votes"] for o in p["options"])

    # 투표
    r = client.post(f"/api/poll/{pid}/vote", headers=H, json={"option_id": "o1"})
    assert r.status_code == 200
    assert r.json()["votedOptionIds"] == ["o1"]
    assert sum(o["votes"] for o in r.json()["options"]) == base + 1

    # 같은 사용자 재투표 차단(409)
    r = client.post(f"/api/poll/{pid}/vote", headers=H, json={"option_id": "o2"})
    assert r.status_code == 409

    # 다른 사용자는 투표 가능
    r = client.post(f"/api/poll/{pid}/vote", headers=H2, json={"option_id": "o2"})
    assert r.status_code == 200
    assert sum(o["votes"] for o in r.json()["options"]) == base + 2


def test_vote_invalid_option():
    r = client.post("/api/poll/festival-2026/vote", headers={"X-User-Id": "u3"}, json={"option_id": "nope"})
    assert r.status_code == 422


def test_single_choice_poll_rejects_multiple_options():
    r = client.post("/api/poll/festival-2026/vote", headers={"X-User-Id": "u4"}, json={"option_ids": ["o1", "o2"]})
    assert r.status_code == 422


def test_cancel_then_revote():
    pid, h = "festival-2026", {"X-User-Id": "u5"}
    assert client.post(f"/api/poll/{pid}/vote", headers=h, json={"option_id": "o1"}).status_code == 200
    before = client.get(f"/api/poll/{pid}", headers=h).json()
    r = client.delete(f"/api/poll/{pid}/vote", headers=h)
    assert r.status_code == 200
    assert r.json()["votedOptionIds"] == []
    assert r.json()["voters"] == before["voters"] - 1
    # 취소 후 다른 선택지로 재투표 가능
    r = client.post(f"/api/poll/{pid}/vote", headers=h, json={"option_id": "o3"})
    assert r.status_code == 200 and r.json()["votedOptionIds"] == ["o3"]
    # 취소할 투표가 없으면 404
    assert client.delete(f"/api/poll/{pid}/vote", headers={"X-User-Id": "nobody"}).status_code == 404


def test_create_multiple_choice_poll_and_vote():
    from datetime import date, timedelta

    body = {"title": "MT 장소", "options": ["가평", "대부도", "춘천"], "deadline": (date.today() + timedelta(days=3)).isoformat(), "multiple": True}
    r = client.post("/api/poll", headers=H, json=body)
    assert r.status_code == 201
    poll = r.json()
    assert poll["multiple"] is True and poll["createdBy"] == H["X-User-Id"]
    o = [x["id"] for x in poll["options"]]

    r = client.post(f"/api/poll/{poll['id']}/vote", headers=H, json={"option_ids": [o[0], o[2]]})
    assert r.status_code == 200
    p = r.json()
    assert sorted(p["votedOptionIds"]) == sorted([o[0], o[2]])
    assert p["voters"] == 1 and sum(x["votes"] for x in p["options"]) == 2

    # 같은 사람이 다시 투표하려면 취소부터
    assert client.post(f"/api/poll/{poll['id']}/vote", headers=H, json={"option_ids": [o[1]]}).status_code == 409


def test_create_poll_validation():
    from datetime import date, timedelta

    future = (date.today() + timedelta(days=3)).isoformat()
    assert client.post("/api/poll", headers=H, json={"title": "x", "options": ["a", "a"], "deadline": future}).status_code == 422
    past = (date.today() - timedelta(days=1)).isoformat()
    assert client.post("/api/poll", headers=H, json={"title": "x", "options": ["a", "b"], "deadline": past}).status_code == 422


def test_migrates_single_vote_schema(tmp_path):
    """복수 선택 이전 DB(votes PK = poll_id,user_id)도 열면 자동 이전되고 기존 표는 보존된다."""
    import sqlite3

    from app import db

    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.executescript(
        """
        CREATE TABLE polls (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL,
                            total INTEGER NOT NULL DEFAULT 0, deadline TEXT NOT NULL);
        CREATE TABLE votes (poll_id TEXT NOT NULL, option_id TEXT NOT NULL, user_id TEXT NOT NULL,
                            PRIMARY KEY (poll_id, user_id));
        INSERT INTO votes VALUES ('festival-2026', 'o1', 'old-user');
        """
    )
    old.commit()
    old.close()

    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    db._ensure_schema(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(polls)")}
    assert {"multiple", "created_by"} <= cols
    assert conn.execute("SELECT user_id FROM votes").fetchall()[0][0] == "old-user"
    conn.execute("INSERT INTO votes VALUES ('festival-2026', 'o2', 'old-user')")  # 복수 선택 저장 가능
    conn.close()
