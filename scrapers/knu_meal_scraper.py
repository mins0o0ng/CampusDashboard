"""
경북대학교 생협 학식(교내식당) 식단 스크래퍼 — 대시보드 '오늘 학식' 위젯 백엔드.

생협 식단 페이지(coop.knu.ac.kr)는 정적 HTML 이며, 중식/석식 테이블이 각각
월~금 5개 컬럼(요일)로 구성된 주간 식단표다. 브라우저 User-Agent 가 없으면
호스팅(gabia)이 403 을 주므로 UA 를 반드시 포함한다.

Usage:
    python knu_meal_scraper.py                      # 오늘 요일 식단(주말이면 월요일)
    python knu_meal_scraper.py --day 월 --out meal.json
    python knu_meal_scraper.py --shop 35 --json     # 식당 코드 지정(shop_sqno)

식당 코드(--shop / shop_sqno) 예시:
    35 = 학생식당(교내식당메뉴),  36 = 복지관 교직원식당,  46 = GP감꽃식당
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional

import requests
from bs4 import BeautifulSoup

BASE = "https://coop.knu.ac.kr/sub03/sub01_01.html"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}
WEEKDAYS = ["월", "화", "수", "목", "금"]  # 컬럼 인덱스 0~4
MEAL_LABELS = ("조식", "중식", "석식")
# '메뉴명 ￦ 6,000' 패턴에서 가격 추출
PRICE_RE = re.compile(r"￦\s*([\d,]+)")
# Actions 러너는 UTC 라서 요일·수집시각을 한국 시간 기준으로 계산한다.
KST = ZoneInfo("Asia/Seoul")


@dataclass
class MealItem:
    """식단 메뉴 1건."""

    name: str          # 메뉴명
    price: Optional[int]  # 가격(원), 없으면 None
    time: Optional[str]   # 제공 시간대(예: 11:00~13:30)


@dataclass
class Meal:
    """한 끼(중식/석식 등) 식단."""

    meal: str          # 조식/중식/석식
    items: list[MealItem]


class BlockedError(RuntimeError):
    """호스팅이 요청을 차단(403 리다이렉트)했을 때."""


def fetch_html(shop: int) -> str:
    """식단 페이지 HTML 을 받아온다.

    가비아 호스팅은 차단한 IP(예: 해외 GitHub Actions 러너)를
    errdoc.gabia.io/403.html 로 302 리다이렉트하고 200 을 돌려준다.
    이를 성공으로 오인하면 '0끼' 가 저장되므로 명시적으로 실패시킨다.
    """
    resp = requests.get(BASE, params={"shop_sqno": shop}, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    if "coop.knu.ac.kr" not in resp.url or "403 Forbidden" in resp.text[:2000]:
        raise BlockedError(f"생협 사이트 접근 차단됨 (최종 URL: {resp.url})")
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def _parse_cell(text: str) -> list[MealItem]:
    """한 컬럼(하루치) 텍스트 → MealItem 리스트.

    '특식 …(11:00~13:30) 흰밥 … ￦ 6,000 순살돈가스★ ￦ 4,500 …' 형태를
    가격(￦)을 구분자로 끊어 메뉴 단위로 분해한다.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    # 현재 시간대(괄호) 추출
    time_m = re.search(r"\((\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2})\)", text)
    cur_time = time_m.group(1).replace(" ", "") if time_m else None

    items: list[MealItem] = []
    # ￦ 가격 기준으로 토막내기
    parts = re.split(r"(￦\s*[\d,]+)", text)
    buf = ""
    for part in parts:
        pm = PRICE_RE.match(part.strip())
        if pm:
            name = re.sub(r"\(\d{1,2}:\d{2}~\d{1,2}:\d{2}\)", "", buf)
            name = name.replace("특식", "").replace("★", "").strip(" ·,")
            if name:
                items.append(MealItem(name=name[:60], price=int(pm.group(1).replace(",", "")), time=cur_time))
            buf = ""
        else:
            buf += " " + part
    return items


TIME_RE = re.compile(r"\(?\s*(\d{1,2})(?::(\d{2})|시)\s*~\s*(\d{1,2})(?::(\d{2})|시)\s*\)?")
LABELS = {"특식", "일품", "정식", "메뉴", "분류", "구분"}


def _parse_li_cell(cell) -> list[MealItem]:
    """<ul class="menu_im"><li>메뉴<p>￦ 5,500</p></li>… 구조의 하루치 셀 → MealItem 리스트.

    첫 <li> 는 '특식<br/>10시~14:30<br/>육회비빔밥' 처럼 시간대가 섞여 있으므로 줄 단위로 분리한다.
    (src/lib/mealImport.ts 의 parseDayCell 과 같은 규칙)
    """
    # 시간대는 구간이 시작되는 메뉴에만 적혀 있으므로, 읽은 시간을 이후 메뉴에 이어서 적용한다.
    time: Optional[str] = None
    items: list[MealItem] = []
    for li in cell.find_all("li"):
        for br in li.find_all("br"):
            br.replace_with("\n")
        lines = [re.sub(r"\s+", " ", l).strip() for l in li.get_text("\n").split("\n")]
        price: Optional[int] = None
        names: list[str] = []
        for line in filter(None, lines):
            pm = PRICE_RE.search(line)
            if pm:
                price = int(pm.group(1).replace(",", ""))
                continue
            tm = TIME_RE.search(line)
            if tm:
                h1, m1, h2, m2 = tm.groups()
                time = f"{int(h1):02d}:{m1 or '00'}~{int(h2):02d}:{m2 or '00'}"
            rest = TIME_RE.sub("", line).strip()
            if rest and rest not in LABELS:
                names.append(rest)
        # 세트 메뉴(주메뉴 + 반찬)는 줄마다 한 가지라 " · " 로 잇는다.
        parts = [n.replace("★", "").replace("☆", "").strip(" ·,") for n in names]
        name = " · ".join(p for p in parts if p)
        if name:
            items.append(MealItem(name=name[:80], price=price, time=time))
    return items


def parse_meals(html: str, day_index: int) -> list[Meal]:
    """식단 HTML → 지정 요일의 중식/석식 Meal 리스트."""
    soup = BeautifulSoup(html, "html.parser")
    meals: list[Meal] = []
    for table in soup.find_all("table"):
        head = re.sub(r"\s+", " ", table.get_text(" ", strip=True))[:6]
        label = next((m for m in MEAL_LABELS if m in head), None)
        if not label:
            continue
        # 첫 행의 셀들이 월~금 컬럼
        row = table.find("tr")
        if not row:
            continue
        cells = row.find_all(["td", "th"])
        if day_index >= len(cells):
            continue
        cell = cells[day_index]
        items = _parse_li_cell(cell) if cell.find("li") else _parse_cell(cell.get_text(" ", strip=True))
        if items:
            meals.append(Meal(meal=label, items=items))
    return meals


def resolve_day(day: Optional[str]) -> tuple[int, str]:
    """요일 인자(또는 오늘) → (컬럼 인덱스, 요일명). 주말이면 월요일로."""
    if day and day in WEEKDAYS:
        return WEEKDAYS.index(day), day
    wd = datetime.now(KST).weekday()  # 0=월 ~ 6=일
    if wd > 4:  # 토/일 → 월요일 식단
        return 0, WEEKDAYS[0]
    return wd, WEEKDAYS[wd]


def main() -> None:
    """CLI 진입점."""
    parser = argparse.ArgumentParser(description="경북대 생협 학식 스크래퍼")
    parser.add_argument("--shop", type=int, default=35, help="식당 코드(shop_sqno), 기본 35=학생식당")
    parser.add_argument("--day", default=None, choices=WEEKDAYS, help="요일(월~금), 기본 오늘")
    parser.add_argument("--out", default=None, help="결과 저장 JSON 경로")
    parser.add_argument("--json", action="store_true", help="stdout 으로 JSON 출력")
    args = parser.parse_args()

    day_index, day_name = resolve_day(args.day)
    try:
        html = fetch_html(args.shop)
    except (requests.RequestException, BlockedError) as e:
        # 기존 파일을 덮어쓰지 않고 실패 종료 → 마지막 정상 데이터 유지
        print(f"수집 실패: {e}", file=sys.stderr)
        sys.exit(2)
    meals = parse_meals(html, day_index)

    payload = {
        "shop_code": args.shop,
        "status": "ok",
        "day": day_name,
        "scraped_at": datetime.now(KST).isoformat(timespec="seconds"),
        "meals": [
            {"meal": m.meal, "items": [asdict(i) for i in m.items]} for m in meals
        ],
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"저장 완료: {args.out} ({day_name}요일, {len(meals)}끼)", file=sys.stderr)
    if args.json or not args.out:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
