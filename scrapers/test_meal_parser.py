"""생협 식단 파서 회귀 테스트 — 실제 페이지 스냅샷(fixtures/coop_meal_sample.html, Wayback 2023-06-04) 기준."""

from pathlib import Path

import knu_meal_scraper as m

HTML = (Path(__file__).parent / "fixtures" / "coop_meal_sample.html").read_text(encoding="utf-8")


def test_monday_lunch_first_item_has_no_time_or_label_in_name():
    lunch = next(x for x in m.parse_meals(HTML, 0) if x.meal == "중식")
    first = lunch.items[0]
    assert (first.name, first.price, first.time) == ("육회비빔밥", 5500, "10:00~14:30")
    assert len(lunch.items) == 22
    assert all("★" not in i.name for i in lunch.items)


def test_dinner_time_applies_to_all_items():
    dinner = next(x for x in m.parse_meals(HTML, 2) if x.meal == "석식")
    assert {i.time for i in dinner.items} == {"17:00~19:00"}


def test_holiday_cell_kept_as_note():
    meals = m.parse_meals(HTML, 1)  # 화: 현충일
    assert [(x.meal, x.items[0].name, x.items[0].price) for x in meals] == [("중식", "현충일", None), ("석식", "현충일", None)]
