"""
경북대학교(KNU) 공지 게시판 스크래퍼 — 대학 통합 대시보드 '학교 공지 필터' 위젯 백엔드.

경북대 메인 공지 게시판(list.action)은 서버사이드 렌더링 정적 HTML이라
헤드리스 브라우저 없이 requests + BeautifulSoup 만으로 수집 가능하다.
키워드 필터를 적용해 학생에게 필요한 공지만 추려 JSON 으로 떨어뜨린다.

Usage:
    python knu_notice_scraper.py                         # 기본 게시판 1페이지, 필터 없음
    python knu_notice_scraper.py --keywords 장학 IT교육 인턴
    python knu_notice_scraper.py --board 1 --pages 2 --out notices.json
    python knu_notice_scraper.py --keywords 장학 --json   # stdout 으로 JSON 출력

게시판 코드(--board / bbs_cde) 예시:
    1  = 공지사항(메인),  11 = 행사,  12 = 교외행사,
    8  = 경북대채용,      32 = 강사채용
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

# 게시판 목록 URL 템플릿 (bbs_cde = 게시판 코드, menu_idx = 메뉴 인덱스)
BASE = "https://www.knu.ac.kr"
LIST_URL = BASE + "/wbbs/wbbs/bbs/btin/list.action"
# 학사공지 계열은 list.action 이 아니라 stdList.action + 상세는 stdViewBtin.action(JS doRead) 구조
STD_LIST_URL = BASE + "/wbbs/wbbs/bbs/btin/stdList.action"
STD_VIEW_URL = BASE + "/wbbs/wbbs/bbs/btin/stdViewBtin.action"
# 게시판 코드 → (menu_idx, 표시명) 매핑. 필요 시 확장.
BOARDS = {
    1: (67, "공지사항"),
    11: (73, "행사"),
    12: (74, "교외행사"),
    8: (220, "경북대채용"),
    32: (221, "강사채용"),
}
# 학사공지 계열 게시판: 키 = 별칭, 값 = (menu_idx, bbs_cde, 표시명)
ACADEMIC_BOARDS = {
    "academic": (42, "stu_812", "학사공지"),
}
# javascript:doRead('bbs_cde','note_div','bltn_no') 에서 인자 추출
DOREAD_RE = re.compile(r"doRead\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)")
# 일부 서버가 봇 차단 → 일반 브라우저 UA 로 위장
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


@dataclass
class Notice:
    """공지 1건. 대시보드 위젯이 그대로 소비하는 데이터 계약(contract)."""

    no: str          # 게시판 번호("공지" 또는 숫자)
    title: str       # 제목(아이콘/공백 정리됨)
    author: str      # 작성 부서
    date: str        # 등록일 (YYYY/MM/DD)
    views: int       # 조회수
    url: str         # 상세 페이지 절대 URL
    has_file: bool   # 첨부파일 유무
    is_new: bool     # '새글' 여부
    pinned: bool     # 상단 고정 공지 여부
    matched: list[str]  # 매칭된 키워드 (필터 결과)


def _clean(text: str) -> str:
    """제목에서 '새글'/'첨부파일' 등 아이콘 텍스트와 중복 공백 제거."""
    text = re.sub(r"\s+", " ", text)
    for junk in ("새글", "첨부파일"):
        text = text.replace(junk, "")
    return text.strip()


def _to_int(text: str) -> int:
    """'1,580' 같은 조회수 문자열을 정수로. 실패 시 0."""
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else 0


def fetch_list_html(board: int, page: int, academic: Optional[str] = None) -> str:
    """게시판 목록 페이지 HTML 을 받아온다. academic 지정 시 학사공지 계열."""
    if academic:
        menu_idx, bbs_cde, _ = ACADEMIC_BOARDS[academic]
        url = STD_LIST_URL
        params = {"bbs_cde": "", "menu_idx": menu_idx, "page": page}
    else:
        menu_idx = BOARDS.get(board, (67, ""))[0]
        url = LIST_URL
        params = {"bbs_cde": board, "menu_idx": menu_idx, "btin.page": page}
    resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def _fix_view_url(href: str, board: int, menu_idx: int) -> str:
    """목록 href 의 빈 게시판 코드(bbs_cde)를 채워 세션 없이도 열리는 URL 로 보정.

    목록 페이지의 상세 링크는 bbs_cde/btin.bbs_cde 가 빈 값으로 내려와
    직접 GET 하면 학교 404 페이지가 뜬다. 게시판 코드와 menu_idx 를 채워 넣는다.
    """
    parts = urlparse(href)
    q = dict(parse_qsl(parts.query, keep_blank_values=True))
    for key in ("bbs_cde", "btin.bbs_cde"):
        if not q.get(key):
            q[key] = str(board)
    if not q.get("menu_idx"):
        q["menu_idx"] = str(menu_idx)
    if not q.get("btin.page", "").isdigit():
        q["btin.page"] = "1"
    return urlunparse(parts._replace(query=urlencode(q)))


def _academic_url(bbs_cde: str, note_div: str, bltn_no: str, menu_idx: int) -> str:
    """학사공지 상세 링크(JS doRead)를 직접 GET 가능한 절대 URL 로 복원."""
    return (
        f"{STD_VIEW_URL}?bbs_cde={bbs_cde}&note_div={note_div}"
        f"&bltn_no={bltn_no}&menu_idx={menu_idx}"
    )


def parse_notices(
    html: str, board: int = 1, academic_menu_idx: Optional[int] = None
) -> list[Notice]:
    """목록 HTML → Notice 리스트. 테이블 행(tr) 단위로 파싱.

    academic_menu_idx 지정 시 학사공지(JS doRead 링크) 파싱 모드.
    """
    soup = BeautifulSoup(html, "html.parser")
    notices: list[Notice] = []

    for tr in soup.select("table tbody tr"):
        if academic_menu_idx is not None:
            # 학사공지: href 대신 onclick/href 의 doRead('bbs_cde','div','bltn_no')
            link = tr.find("a", href=DOREAD_RE) or tr.find("a", onclick=DOREAD_RE)
            if not link:
                continue
            m = DOREAD_RE.search(link.get("href", "") or link.get("onclick", ""))
            if not m:
                continue
            href = _academic_url(m.group(1), m.group(2), m.group(3), academic_menu_idx)
        else:
            # 메인 게시판: viewBtin.action 직접 링크
            link = tr.find("a", href=re.compile(r"viewBtin\.action"))
            if not link:
                continue
            href = urljoin(BASE, link.get("href", "").replace(">", ""))
            href = _fix_view_url(href, board, BOARDS.get(board, (67, ""))[0])

        cells = tr.find_all("td")
        if len(cells) < 5:
            continue

        no_text = cells[0].get_text(strip=True)
        title = _clean(link.get_text(" ", strip=True))
        # 마지막 3개 셀이 작성자/등록일/조회수인 게시판 표준 레이아웃
        author = cells[-3].get_text(strip=True)
        date = cells[-2].get_text(strip=True)
        views = _to_int(cells[-1].get_text(strip=True))

        notices.append(
            Notice(
                no=no_text,
                title=title,
                author=author,
                date=date,
                views=views,
                url=href,
                has_file=bool(tr.find("img", alt=re.compile("첨부"))),
                is_new=bool(tr.find("img", alt=re.compile("새글"))),
                pinned=(no_text == "공지"),
                matched=[],
            )
        )
    return notices


def filter_by_keywords(notices: list[Notice], keywords: list[str]) -> list[Notice]:
    """제목에 키워드가 하나라도 포함된 공지만 반환. 키워드 없으면 전체."""
    if not keywords:
        return notices
    result: list[Notice] = []
    for n in notices:
        hits = [kw for kw in keywords if kw.lower() in n.title.lower()]
        if hits:
            n.matched = hits
            result.append(n)
    return result


def scrape(
    board: int, pages: int, keywords: list[str], academic: Optional[str] = None
) -> list[Notice]:
    """여러 페이지를 긁어 키워드 필터까지 적용한 최종 공지 리스트.

    academic 별칭(예: 'academic') 지정 시 학사공지 게시판을 긁는다.
    """
    academic_menu_idx = ACADEMIC_BOARDS[academic][0] if academic else None
    collected: list[Notice] = []
    seen: set[str] = set()  # 중복(상단 고정+본문 중복) 제거 — bltn_no/url 기준
    for page in range(1, pages + 1):
        html = fetch_list_html(board, page, academic=academic)
        for n in parse_notices(html, board=board, academic_menu_idx=academic_menu_idx):
            # 문서 id(doc_no/bltn_no) 기준 중복 제거 — 상단고정(top)·본문(row) 중복 통합
            id_match = re.search(r"(?:doc_no|bltn_no)=(\d+)", n.url)
            key = id_match.group(1) if id_match else n.url
            if key in seen:
                continue
            seen.add(key)
            collected.append(n)
    return filter_by_keywords(collected, keywords)


def main() -> None:
    """CLI 진입점."""
    parser = argparse.ArgumentParser(description="경북대 공지 게시판 스크래퍼")
    parser.add_argument("--board", type=int, default=1, help="게시판 코드(bbs_cde), 기본 1=공지사항")
    parser.add_argument(
        "--academic", choices=list(ACADEMIC_BOARDS), default=None,
        help="학사공지 계열 게시판 별칭(예: academic). 지정 시 --board 무시",
    )
    parser.add_argument("--pages", type=int, default=1, help="긁을 페이지 수")
    parser.add_argument("--keywords", nargs="*", default=[], help="필터 키워드 (공백 구분)")
    parser.add_argument("--out", default=None, help="결과 저장 JSON 경로")
    parser.add_argument("--json", action="store_true", help="stdout 으로 JSON 출력")
    args = parser.parse_args()

    if args.academic:
        board_name = ACADEMIC_BOARDS[args.academic][2]
    else:
        board_name = BOARDS.get(args.board, (0, "알수없음"))[1]
    notices = scrape(args.board, args.pages, args.keywords, academic=args.academic)

    payload = {
        "board": board_name,
        "board_code": args.board,
        "scraped_at": datetime.now().isoformat(timespec="seconds"),
        "keywords": args.keywords,
        "count": len(notices),
        "notices": [asdict(n) for n in notices],
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"저장 완료: {args.out} ({len(notices)}건)", file=sys.stderr)
    if args.json or not args.out:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
