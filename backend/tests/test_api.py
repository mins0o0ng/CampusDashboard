"""
백엔드 API 통합 테스트 — TestClient(실제 네트워크 불필요).

검증 포인트:
- 시간표 CRUD + 사용자 격리(다른 user는 못 봄/못 지움)
- 투표 서버측 1인 1표 강제, 마감 검사
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
    assert p["votedOptionId"] is None
    base = sum(o["votes"] for o in p["options"])

    # 투표
    r = client.post(f"/api/poll/{pid}/vote", headers=H, json={"option_id": "o1"})
    assert r.status_code == 200
    assert r.json()["votedOptionId"] == "o1"
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
