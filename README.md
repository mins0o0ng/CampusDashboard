# CampusDashboard (캠퍼스 보드)

대학생이 자기 소속(과·동아리·수업그룹) 단위로 쓰는 개인화 위젯 대시보드 프로토타입.
설계 원칙: **기본은 가볍게, 깊이는 선택으로, 빈칸은 AI로.**

## 🌐 라이브 사이트
**https://mins0o0ng.github.io/CampusDashboard/**

실제 React 앱(`src/`, Vite 빌드)이 GitHub Pages 로 배포됩니다.
데모 로그인(학번·이름 입력) 후 대시보드 진입. 시간표·투표가 실제로 동작하며 변경사항은 브라우저(localStorage)에 저장됩니다.
**공지·학식은 실데이터** — `scrape.yml` 이 매일 수집해 `public/data/*.json` 으로 커밋하고,
끝나면 `deploy-pages.yml` 이 이어서(workflow_run) 재배포합니다. **별도 서버가 없습니다.**

```
scrape.yml (매일 06:00 KST, 수 시간 지연될 수 있음)
  ├ notices 잡 (ubuntu-latest)        → notices.json
  ├ meal 잡   (vars.MEAL_RUNNER)      → meal_<식당>.json
  └ commit 잡 → public/data 커밋
        ↓ workflow_run
deploy-pages.yml → npm run build → Pages 배포 → 앱이 ./data/*.json fetch
```
> Pages 는 저장소 **Settings → Pages → Source: GitHub Actions** 로 설정되어 있어야 합니다.

### ⚠️ 학식 수집에는 국내 IP 러너가 필요합니다
생협 사이트(coop.knu.ac.kr, 가비아 호스팅)는 해외 IP 를 `errdoc.gabia.io/403.html` 로 차단합니다.
GitHub 호스티드 러너는 미국 IP 라서 학식을 가져올 수 없습니다(SSO 문제가 아님).
1. 국내 PC/서버(예: Oracle Cloud 서울·춘천 무료 VM)에 **self-hosted runner** 를 등록
   (Settings → Actions → Runners → New self-hosted runner)
2. Settings → Secrets and variables → Actions → **Variables** 에 `MEAL_RUNNER = self-hosted` 추가

설정 전에는 스크래퍼가 차단을 감지해 실패 종료하고(기존 JSON 유지), 위젯은
"학식 정보를 가져오지 못했어요 + 생협 페이지 바로가기" 를 표시합니다.

### ✎ 식단 수동 업로드 (자동 수집의 백업)
학식 위젯 오른쪽 위 **▦** → 월력형 식단표.
- **⤓ 생협 페이지 붙여넣기 (주 1회 30초)**: 생협 식단 페이지에서 Ctrl+A → Ctrl+C → 붙여넣기 상자에 Ctrl+V.
  페이지 전체에서 식단표(중식·석식 표)만 골라 그 주 월~토를 한 번에 채웁니다. 날짜는 페이지의
  "2026-10-05 ~ 2026-10-11" 표기에서 읽습니다. 페이지 소스(Ctrl+U)나 저장한 .html 파일도 됩니다.
- **📋 생협 식단 모으기 (북마클릿, 추천)**: 가져오기 창의 버튼을 즐겨찾기 막대로 끌어다 놓고, 생협 식단 페이지에서 누르면
  메뉴에 있는 **모든 식당** 페이지를 모아 복사합니다 → 붙여넣기 한 번으로 전 식당 일주일치. 새로 발견한 식당 이름은 게시 시 함께 저장됩니다.
- 위젯 ⚙ 로 "내 식당"을 골라 탭에 보일 식당을 정할 수 있습니다.
- 날짜 칸을 눌러 조식/중식/석식을 직접 고칠 수도 있습니다(한 줄에 메뉴 하나, 끝 숫자는 가격).
- 입력은 먼저 이 브라우저에 **임시저장**되고, **게시하기**를 누르면 GitHub API 로
  `public/data/meal_manual.json` 을 main 에 커밋 → 자동 재배포되어 모두에게 보입니다.
- 게시에는 관리자 토큰이 필요합니다: GitHub → Settings → Developer settings →
  Fine-grained token → 이 저장소만 선택, **Contents: Read and write** 권한만 부여.
- 같은 날짜·식당에 수동 식단이 있으면 자동 수집본보다 **우선** 표시됩니다.
- 토큰이 없으면 **JSON 내보내기** 후 같은 경로에 직접 커밋해도 됩니다.

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
