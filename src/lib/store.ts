import type { ClassBlock, Poll } from "../types";

const NS = "campus.";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* 저장 실패(프라이빗 모드 등)는 무시 */
  }
}

/* ============================ 시간표 스토어 ============================ */

const SEED_TIMETABLE: ClassBlock[] = [
  { id: "c1", subject: "알고리즘", room: "IT4-301", day: 0, start: 9, end: 11, color: "indigo", orgId: "org-cs" },
  { id: "c2", subject: "운영체제", room: "공대 211", day: 2, start: 9, end: 10, color: "red", orgId: "org-cs" },
  { id: "c3", subject: "소프트웨어공학", room: "IT1-103", day: 1, start: 11, end: 12, color: "amber", orgId: "org-cs" },
  { id: "c4", subject: "DB설계", room: "IT2-205", day: 3, start: 11, end: 13, color: "green", orgId: "org-cs" },
  { id: "c5", subject: "캡스톤디자인", room: "IT4-401", day: 4, start: 9, end: 10, color: "indigo", orgId: "org-capstone" },
];

export const timetableStore = {
  load(): ClassBlock[] {
    return read<ClassBlock[]>("timetable", SEED_TIMETABLE);
  },
  save(classes: ClassBlock[]): void {
    write("timetable", classes);
  },
  add(classes: ClassBlock[], block: Omit<ClassBlock, "id">): ClassBlock[] {
    const next = [...classes, { ...block, id: `c${Date.now()}` }];
    this.save(next);
    return next;
  },
  update(classes: ClassBlock[], block: ClassBlock): ClassBlock[] {
    const next = classes.map((c) => (c.id === block.id ? block : c));
    this.save(next);
    return next;
  },
  remove(classes: ClassBlock[], id: string): ClassBlock[] {
    const next = classes.filter((c) => c.id !== id);
    this.save(next);
    return next;
  },
};

/* ============================ 투표 스토어 ============================ */

const SEED_POLLS: Poll[] = [
  {
    id: "festival-2026",
    title: "축제 초청 가수 투표",
    owner: "학생회",
    total: 32,
    deadline: "2026-08-31",
    options: [
      { id: "o1", label: "데이식스", votes: 9 },
      { id: "o2", label: "아이브", votes: 5 },
      { id: "o3", label: "잔나비", votes: 3 },
    ],
  },
  {
    id: "mt-2026-2",
    title: "2학기 MT 날짜 선호 조사",
    owner: "컴퓨터공학과",
    total: 32,
    deadline: "2026-07-20",
    options: [
      { id: "o1", label: "9/4(금)~9/5(토)", votes: 7 },
      { id: "o2", label: "9/11(금)~9/12(토)", votes: 4 },
      { id: "o3", label: "9/18(금)~9/19(토)", votes: 2 },
    ],
  },
  {
    id: "club-dinner-2026",
    title: "동아리 회식 메뉴",
    owner: "블로우파이프 동아리",
    total: 14,
    deadline: "2026-07-05",
    options: [
      { id: "o1", label: "삼겹살", votes: 5 },
      { id: "o2", label: "치킨+맥주", votes: 4 },
      { id: "o3", label: "마라탕", votes: 1 },
    ],
  },
];

// 구버전(단일 투표) 저장분을 목록 형태로 흡수한다.
function migratePolls(): Poll[] {
  const legacy = read<Poll | null>("poll.festival-2026", null);
  const merged = SEED_POLLS.map((p) => (legacy && p.id === legacy.id ? legacy : p));
  if (legacy) {
    // 병합 결과를 먼저 영속화한 뒤에 구키를 제거해야 재방문 시 투표 기록이 유실되지 않는다.
    write("polls", merged);
    try {
      localStorage.removeItem(NS + "poll.festival-2026");
    } catch {
      /* 무시 */
    }
  }
  return merged;
}

export const pollStore = {
  loadAll(): Poll[] {
    const stored = read<Poll[] | null>("polls", null);
    if (stored && stored.length > 0) return stored;
    return migratePolls();
  },
  saveAll(polls: Poll[]): void {
    write("polls", polls);
  },
  vote(polls: Poll[], pollId: string, optionId: string): Poll[] {
    const next = polls.map((p) => {
      if (p.id !== pollId || p.votedOptionId || isClosed(p)) return p;
      return {
        ...p,
        votedOptionId: optionId,
        options: p.options.map((o) =>
          o.id === optionId ? { ...o, votes: o.votes + 1 } : o
        ),
      };
    });
    this.saveAll(next);
    return next;
  },
};

/* ============================ 파생 유틸 ============================ */

function todayMidnight(): Date {
  return new Date(new Date().toDateString());
}

// "YYYY-MM-DD" 를 로컬 자정으로 파싱한다.
// new Date(string) 은 UTC 자정으로 해석되어 KST 등에서 D-day 가 하루 어긋난다.
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function totalVotes(poll: Poll): number {
  return poll.options.reduce((s, o) => s + o.votes, 0);
}

export function percent(poll: Poll, optionId: string, precomputedTotal?: number): number {
  const total = precomputedTotal ?? totalVotes(poll);
  if (total === 0) return 0;
  const v = poll.options.find((o) => o.id === optionId)?.votes ?? 0;
  return Math.round((v / total) * 100);
}

export function isClosed(poll: Poll): boolean {
  return parseLocalDate(poll.deadline) < todayMidnight();
}

export function dday(poll: Poll): number {
  const ms = parseLocalDate(poll.deadline).getTime() - todayMidnight().getTime();
  return Math.ceil(ms / 86_400_000);
}
