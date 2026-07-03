# CampusDashboard (캠퍼스 보드)

대학생이 자기 소속(과·동아리·수업그룹) 단위로 쓰는 개인화 위젯 대시보드 프로토타입.
설계 원칙: **기본은 가볍게, 깊이는 선택으로, 빈칸은 AI로.**

## 🌐 라이브 사이트
**https://mins0o0ng.github.io/CampusDashboard/**

실제 React 앱(`src/`, Vite 빌드)이 GitHub Pages 로 배포됩니다.
시간표·투표가 실제로 동작하며 변경사항은 브라우저(localStorage)에 저장됩니다.
**공지·학식은 실데이터** — 배포 워크플로우가 빌드 직전에 스크래퍼를 실행해
최신 `data/*.json` 을 함께 배포하고, 매일 06:30 KST 에 자동 재배포됩니다.
**별도 서버가 없습니다.**

```
deploy-pages.yml (push to main + cron 매일)
  → scrapers/*.py 실행 → public/data/notices.json, meal.json 생성
  → npm run build (Vite) → dist/ 배포
  → 앱이 ./data/*.json fetch → 공지·학식 위젯 렌더
```
> Pages 는 저장소 **Settings → Pages → Source: GitHub Actions** 로 설정되어 있어야 합니다.
> `scrape.yml` 은 로컬 개발용 실데이터(`public/data`)를 매일 커밋합니다(배포 폴백 겸용).

## 이번 버전에 구현된 기능

### 시간표 (인터랙티브) — `src/components/TimetableWidget.tsx`
- 빈 칸 클릭 → 강의 추가, 블록 클릭 → 수정/삭제
- 과목·강의실·요일·시간·색상 편집
- `localStorage` 저장(새로고침 유지)

### 투표 (인터랙티브) — `src/components/PollWidget.tsx`
- 선택지 투표 → 실시간 백분율·막대
- 중복 투표 방지 + 마감(D-day) 처리
- 내 투표 `localStorage` 보존

> 데이터 계층(`src/lib/store.ts`)은 현재 localStorage 목 구현이지만, 동일한 함수
> 시그니처를 서버 API(fetch)로 교체하면 백엔드 연동으로 바로 승격되도록 설계함.
> (투표·게시판·회비 같은 "자체DB" 기능의 프런트 계약을 먼저 고정하는 목적)

## 실행

```bash
# 1) 정식 개발 서버 (Vite + React + TS + Tailwind)
npm install
npm run dev

# 2) 빌드 없이 즉시 확인
#    standalone-demo.html 더블클릭 (시간표·투표 동일 로직, localStorage 저장)
```

## 데이터 스크래퍼 — `scrapers/`
공지·학식은 경북대 사이트에서 실데이터 수집 가능(검증 완료).

```bash
pip install -r scrapers/requirements.txt
python scrapers/knu_notice_scraper.py --keywords 장학 IT교육 인턴   # 메인 공지
python scrapers/knu_notice_scraper.py --academic academic           # 학사공지
python scrapers/knu_meal_scraper.py                                 # 학식(생협)
```

## 구조
```
src/
  types.ts                 도메인 타입(단일 출처)
  lib/store.ts             데이터 계층(localStorage 목 → 추후 API 교체)
  components/
    TimetableWidget.tsx    시간표 기능
    PollWidget.tsx         투표 기능
  App.tsx / main.tsx       앱 셸
scrapers/                  공지·학식 파이썬 스크래퍼

## 🔌 백엔드 (자체DB) — `backend/`
투표·시간표를 진짜로 만드는 서버. FastAPI + SQLite.
- **시간표**: 사용자별 CRUD 영속 저장
- **투표**: `votes(poll_id, user_id)` PK 로 **서버측 1인 1표 강제**(localStorage 데모의 한계 해결)
- **공지·학식**: 스크래퍼 산출물 서빙

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8000
python -m pytest tests/ -q     # 4 passed (CRUD·사용자격리·1인1표·마감)
```
프런트 연동: `src/lib/api.ts` 가 `store.ts` 와 동일 계약을 서버 호출로 제공.
위젯에서 `timetableStore`/`pollStore` → `timetableApi`/`pollApi` 로 import 만 바꾸면 서버 모드.
백엔드 주소는 `.env` 의 `VITE_API_BASE` 로 지정.

> 한계: `X-User-Id` 헤더 식별은 데모용(위조 가능). 진짜 1인 1표는 학교 SSO/JWT 인증이 전제.
