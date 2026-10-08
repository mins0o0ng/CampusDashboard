// mealImport.ts
// 용도: 생협 식단 페이지(coop.knu.ac.kr/sub03/sub01_01.html)를 통째로 붙여넣으면
//       식단표 부분만 골라 그 주(월~토) 식단으로 변환한다.
//       입력: 페이지 소스(Ctrl+U → 전체 복사), 화면 전체 복사(Ctrl+A → Ctrl+C), 저장한 .html 파일.
//
// 생협 페이지 구조(실제 HTML 기준):
//   <p>2026-10-05 ~ 2026-10-11</p>                       ← 주 날짜
//   <table><caption>중식</caption><tr>                    ← 끼니별 표, 한 행에 월~토 6칸
//     <td><div>특식</div><ul class="menu_im">
//       <li>특식<br/>10시~14:30<br/>육회비빔밥<p></p><p>￦ 5,500</p></li>   ← 첫 메뉴에 시간대
//       <li>돈목살스테이크★<p></p><p>￦ 6,000</p></li>
//     </ul></td> ...

import type { MealItem, MealSection } from "./staticData";
import { dateKey } from "./mealManual";

const SLOTS = ["조식", "중식", "석식"] as const;
const DAY_NAMES = ["월", "화", "수", "목", "금", "토"];
const PRICE = /(?:￦|₩)\s*([\d,]+)/;
// "10시~14:30", "17:00~19:00", "(11:00~13:30)"
const TIME = /\(?\s*(\d{1,2})(?::(\d{2})|시)\s*~\s*(\d{1,2})(?::(\d{2})|시)\s*\)?/;

export interface ImportedWeek {
  dates: string[]; // 월~토 "YYYY-MM-DD"
  days: Record<string, MealSection[]>; // 날짜 → 끼니
  dateSource: "page" | "chosen"; // 날짜를 페이지에서 찾았는지, 사용자가 고른 주인지
  tableCount: number; // 찾은 끼니 표 수(0 이면 식단표를 못 찾은 것)
  // 실패 원인 파악용: 받은 내용에 표가 몇 개였고 각 표의 제목/첫 글자가 무엇이었는지
  diag: { allTables: number; heads: string[] };
}

function fmtTime(m: RegExpMatchArray): string {
  const hhmm = (h: string, mm?: string) => `${h.padStart(2, "0")}:${mm ?? "00"}`;
  return `${hhmm(m[1], m[2])}~${hhmm(m[3], m[4])}`;
}

function lines(el: Element): string[] {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("p,div,li").forEach((b) => b.append("\n"));
  return (clone.textContent ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}

const cleanName = (s: string) => s.replace(/★|☆/g, "").replace(/^[\s·,/-]+|[\s·,/-]+$/g, "").trim();
const isLabel = (s: string) => /^(특식|일품|정식|메뉴|분류|구분)$/.test(s);

/* ==================== 하루치(셀) → 메뉴 ==================== */

export function parseDayCell(td: Element): MealItem[] {
  const lis = Array.from(td.querySelectorAll("li"));
  // <li> 가 없으면 가격 줄까지를 메뉴 하나로 묶는다(구조가 바뀌었을 때의 폴백)
  const units: string[][] = [];
  if (lis.length > 0) units.push(...lis.map(lines));
  else {
    let cur: string[] = [];
    for (const l of lines(td)) {
      cur.push(l);
      if (PRICE.test(l)) (units.push(cur), (cur = []));
    }
    if (cur.length) units.push(...cur.map((l) => [l]));
  }
  let time: string | null = null;
  const items: MealItem[] = [];
  for (const ls of units) {
    let price: number | null = null;
    const names: string[] = [];
    for (const l of ls) {
      const p = l.match(PRICE);
      if (p) {
        price = Number(p[1].replace(/,/g, ""));
        const before = cleanName(l.replace(PRICE, "").replace(/원/, ""));
        if (before && !isLabel(before)) names.push(before);
        continue;
      }
      const t = l.match(TIME);
      if (t) time = fmtTime(t);
      const rest = l.replace(TIME, "").trim();
      if (rest && !isLabel(rest)) names.push(rest);
    }
    const name = cleanName(names.join(" "));
    if (name) items.push({ name: name.slice(0, 60), price, time });
  }
  return items.map((i) => ({ ...i, time })); // 시간대는 첫 메뉴에만 적혀 있으므로 전체에 적용
}

/* ==================== 날짜 ==================== */

function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export function thisMonday(): Date {
  return mondayOf(new Date());
}

export function weekDates(monday: Date, count = DAY_NAMES.length): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return dateKey(d);
  });
}

// "2026-10-05 ~ 2026-10-11" 또는 "월 (10/05)" 로 그 주 월요일을 찾는다.
function findWeekMonday(text: string, year: number): Date | null {
  const full = text.match(/(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*~/);
  if (full) return mondayOf(new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3])));
  const short = text.match(/월\s*\(\s*(\d{1,2})\s*[./]\s*(\d{1,2})\s*\)/);
  if (short) return mondayOf(new Date(year, Number(short[1]) - 1, Number(short[2])));
  return null;
}

/* ==================== 페이지 → 일주일 ==================== */

type Slot = (typeof SLOTS)[number];
const SLOT_ALIASES: [RegExp, Slot][] = [
  [/조식|아침/, "조식"],
  [/중식|점심/, "중식"],
  [/석식|저녁/, "석식"],
];

function slotFromText(text: string): Slot | null {
  return SLOT_ALIASES.find(([re]) => re.test(text))?.[1] ?? null;
}

// 표 하나가 끼니 하나인 구조(<caption>중식</caption>) — 2023 생협 페이지 형태
function slotOf(table: HTMLTableElement): Slot | null {
  const caption = (table.caption?.textContent ?? "").trim();
  const head = (table.textContent ?? "").replace(/\s+/g, "").slice(0, 6);
  return slotFromText(caption) ?? slotFromText(head);
}

// 표 하나에 끼니가 행으로 들어 있는 구조(행 첫 칸이 '중식', 나머지가 월~토) — 페이지 개편 대비
function slotRows(table: HTMLTableElement): [Slot, Element[]][] {
  const out: [Slot, Element[]][] = [];
  for (const row of Array.from(table.rows)) {
    if (row.cells.length < 6) continue;
    const first = (row.cells[0].textContent ?? "").replace(/\s+/g, "");
    const slot = first.length <= 8 ? slotFromText(first) : null;
    if (slot) out.push([slot, Array.from(row.cells).slice(1, 1 + DAY_NAMES.length)]);
  }
  return out;
}

// 메뉴 행 = 셀이 5개 이상이고 내용이 가장 많은 행. 앞에 '분류' 같은 짧은 라벨 칸이 있으면 뺀다.
function dayCells(table: HTMLTableElement): Element[] | null {
  const row = Array.from(table.rows)
    .filter((r) => r.cells.length >= 5)
    .sort((a, b) => (b.textContent ?? "").length - (a.textContent ?? "").length)[0];
  if (!row) return null;
  const cells = Array.from(row.cells);
  const first = (cells[0].textContent ?? "").trim();
  if (cells.length > 6 || (first.length < 8 && slotFromText(first))) cells.shift();
  return cells.slice(0, DAY_NAMES.length);
}

export function parseCoopPage(input: string, chosenMonday: Date): ImportedWeek {
  const doc = new DOMParser().parseFromString(input, "text/html");
  const pageText = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const found = findWeekMonday(pageText, chosenMonday.getFullYear());
  const dates = weekDates(found ?? chosenMonday);
  const days: Record<string, MealSection[]> = {};
  let tableCount = 0;
  const tables = Array.from(doc.querySelectorAll("table"));

  const addCells = (slot: Slot, cells: Element[]) => {
    tableCount++;
    cells.forEach((td, i) => {
      const items = parseDayCell(td);
      if (items.length === 0) return;
      const list = (days[dates[i]] ??= []);
      if (!list.some((s) => s.meal === slot)) list.push({ meal: slot, items });
    });
  };

  for (const table of tables) {
    const slot = slotOf(table);
    const cells = slot ? dayCells(table) : null;
    if (slot && cells) addCells(slot, cells);
    else for (const [rowSlot, rowCells] of slotRows(table)) addCells(rowSlot, rowCells);
  }
  for (const k of Object.keys(days)) {
    days[k].sort((a, b) => SLOTS.indexOf(a.meal as Slot) - SLOTS.indexOf(b.meal as Slot));
  }
  const heads = tables.map((t) =>
    ((t.caption?.textContent ?? "") || (t.textContent ?? "")).replace(/\s+/g, " ").trim().slice(0, 20)
  );
  return { dates, days, dateSource: found ? "page" : "chosen", tableCount, diag: { allTables: tables.length, heads } };
}

export { DAY_NAMES };
