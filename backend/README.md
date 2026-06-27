# Campus Board — Backend API

FastAPI + SQLite. 시간표(사용자별 영속)와 투표(서버측 1인 1표)를 담당.
프런트의 localStorage 목(`src/lib/store.ts`)을 대체하는 실제 데이터 계층.

## 실행
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 문서: http://localhost:8000/docs
```

## 엔드포인트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/timetable | 내 시간표 조회 (헤더 `X-User-Id`) |
| POST | /api/timetable | 강의 추가 |
| PUT | /api/timetable/{id} | 강의 수정(본인만) |
| DELETE | /api/timetable/{id} | 강의 삭제(본인만) |
| GET | /api/poll/{id} | 투표 현황(내 투표 포함) |
| POST | /api/poll/{id}/vote | 투표 — 서버측 1인 1표·마감 검사 |
| GET | /api/notices?keyword= | 공지(스크래퍼 산출물) |
| GET | /api/meal | 오늘 학식 |
| GET | /api/health | 헬스체크 |

## 1인 1표 강제
`votes(poll_id, user_id)` PK 로 DB 레벨에서 중복 차단. 같은 사용자가 재투표하면 409.
사용자는 `X-User-Id` 헤더로 식별(데모). **실서비스는 학교 SSO/JWT 로 교체 필요** —
헤더 방식은 위조 가능하므로 진짜 1인 1표 보장은 인증 연동이 전제다.

## 테스트
```bash
cd backend && python -m pytest tests/ -q   # 4 passed: CRUD·격리·1인1표·마감
```

## 배포
- Docker: `docker build -t campus-api backend && docker run -p 8000:8000 -v $PWD/data:/data campus-api`
- Render/Railway/Fly.io 등에 컨테이너로 올리고 프런트의 `VITE_API_BASE` 를 그 주소로 지정.
- SQLite 파일은 볼륨(`CAMPUS_DB`)으로 영속화.
