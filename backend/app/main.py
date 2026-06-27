"""
캠퍼스 보드 백엔드 API (FastAPI + SQLite).

핵심:
- 시간표: 사용자별 CRUD (X-User-Id 헤더로 사용자 구분)
- 투표: 서버측 1인 1표 강제(votes 테이블 PK), 마감 검사
- 공지/학식: 스크래퍼가 떨군 docs/data/*.json 서빙

실행:
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .db import get_conn, init_db

app = FastAPI(title="Campus Board API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.environ.get(
    "CAMPUS_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "docs", "data")
)

# 모듈 로드 시 스키마 보장(idempotent) — get_conn 이 첫 호출에서 자동 보장하지만 명시.
init_db()


def current_user(x_user_id: Optional[str] = Header(default=None)) -> str:
    """X-User-Id 헤더에서 사용자 식별. 없으면 익명 데모 사용자."""
    return x_user_id or "demo-user"


# ---------- 시간표 ----------

class ClassIn(BaseModel):
    subject: str = Field(min_length=1, max_length=60)
    room: Optional[str] = Field(default=None, max_length=40)
    day: int = Field(ge=0, le=4)
    start: float = Field(ge=0, le=24)
    end: float = Field(ge=0, le=24)
    color: str = Field(default="indigo")

    def validate_span(self) -> None:
        if self.end <= self.start:
            raise HTTPException(status_code=422, detail="end는 start보다 커야 합니다.")


class ClassOut(ClassIn):
    id: str


@app.get("/api/timetable", response_model=list[ClassOut])
def list_classes(user: str = Depends(current_user)) -> list[dict]:
    """내 시간표 전체 조회."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, subject, room, day, start, end, color FROM classes WHERE user_id = ? ORDER BY day, start",
            (user,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/timetable", response_model=ClassOut, status_code=201)
def add_class(body: ClassIn, user: str = Depends(current_user)) -> dict:
    """강의 추가."""
    body.validate_span()
    cid = "c" + uuid.uuid4().hex[:10]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO classes(id, user_id, subject, room, day, start, end, color) VALUES(?,?,?,?,?,?,?,?)",
            (cid, user, body.subject, body.room, body.day, body.start, body.end, body.color),
        )
    return {"id": cid, **body.model_dump()}


@app.put("/api/timetable/{class_id}", response_model=ClassOut)
def update_class(class_id: str, body: ClassIn, user: str = Depends(current_user)) -> dict:
    """강의 수정(본인 것만)."""
    body.validate_span()
    with get_conn() as conn:
        owned = conn.execute(
            "SELECT 1 FROM classes WHERE id = ? AND user_id = ?", (class_id, user)
        ).fetchone()
        if not owned:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")
        conn.execute(
            "UPDATE classes SET subject=?, room=?, day=?, start=?, end=?, color=? WHERE id=? AND user_id=?",
            (body.subject, body.room, body.day, body.start, body.end, body.color, class_id, user),
        )
    return {"id": class_id, **body.model_dump()}


@app.delete("/api/timetable/{class_id}", status_code=204)
def delete_class(class_id: str, user: str = Depends(current_user)) -> None:
    """강의 삭제(본인 것만)."""
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM classes WHERE id = ? AND user_id = ?", (class_id, user)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="강의를 찾을 수 없습니다.")


# ---------- 투표 ----------

class VoteIn(BaseModel):
    option_id: str


def _poll_payload(conn, poll_id: str, user: str) -> dict:
    """투표 1건을 집계해 프런트 계약(Poll) 형태로 반환."""
    poll = conn.execute("SELECT * FROM polls WHERE id = ?", (poll_id,)).fetchone()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없습니다.")
    options = conn.execute(
        "SELECT id, label FROM poll_options WHERE poll_id = ? ORDER BY seq", (poll_id,)
    ).fetchall()
    counts = dict(
        conn.execute(
            "SELECT option_id, COUNT(*) FROM votes WHERE poll_id = ? GROUP BY option_id", (poll_id,)
        ).fetchall()
    )
    my = conn.execute(
        "SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?", (poll_id, user)
    ).fetchone()
    return {
        "id": poll["id"],
        "title": poll["title"],
        "owner": poll["owner"],
        "total": poll["total"],
        "deadline": poll["deadline"],
        "votedOptionId": my["option_id"] if my else None,
        "options": [{"id": o["id"], "label": o["label"], "votes": counts.get(o["id"], 0)} for o in options],
    }


@app.get("/api/poll/{poll_id}")
def get_poll(poll_id: str, user: str = Depends(current_user)) -> dict:
    """투표 현황 조회(내 투표 포함)."""
    with get_conn() as conn:
        return _poll_payload(conn, poll_id, user)


@app.post("/api/poll/{poll_id}/vote")
def cast_vote(poll_id: str, body: VoteIn, user: str = Depends(current_user)) -> dict:
    """투표하기 — 서버측 1인 1표 + 마감 검사."""
    with get_conn() as conn:
        poll = conn.execute("SELECT deadline FROM polls WHERE id = ?", (poll_id,)).fetchone()
        if not poll:
            raise HTTPException(status_code=404, detail="투표를 찾을 수 없습니다.")
        if date.fromisoformat(poll["deadline"]) < date.today():
            raise HTTPException(status_code=409, detail="마감된 투표입니다.")
        valid = conn.execute(
            "SELECT 1 FROM poll_options WHERE id = ? AND poll_id = ?", (body.option_id, poll_id)
        ).fetchone()
        if not valid:
            raise HTTPException(status_code=422, detail="존재하지 않는 선택지입니다.")
        dup = conn.execute(
            "SELECT 1 FROM votes WHERE poll_id = ? AND user_id = ?", (poll_id, user)
        ).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail="이미 투표했습니다.")
        conn.execute(
            "INSERT INTO votes(poll_id, option_id, user_id) VALUES(?,?,?)",
            (poll_id, body.option_id, user),
        )
        return _poll_payload(conn, poll_id, user)


# ---------- 공지 / 학식 ----------

def _load_json(name: str) -> dict:
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/notices")
def get_notices(keyword: Optional[str] = None) -> dict:
    """공지 목록. keyword 지정 시 제목 필터."""
    data = _load_json("notices.json")
    notices = data.get("notices", [])
    if keyword:
        notices = [n for n in notices if keyword in n.get("title", "")]
    return {"scraped_at": data.get("scraped_at"), "count": len(notices), "notices": notices}


@app.get("/api/meal")
def get_meal() -> dict:
    """오늘 학식."""
    return _load_json("meal.json") or {"day": None, "meals": []}


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "time": datetime.now().isoformat(timespec="seconds")}
