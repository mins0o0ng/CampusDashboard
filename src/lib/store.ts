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

// 시드 투표 마감일은 오늘 기준 상대 날짜로 만든다.
// 고정 날짜를 쓰면 시간이 지나 모든 투표가 '마감됨' 이 되어 데모가 동작하지 않는다.
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SEED_POLLS: Poll[] = [
  {
    id: "festival-2026",
    title: "축제 초청 가수 투표",
    owner: "학생회",
    total: 32,
    deadline: daysFromNow(14),
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
    deadline: daysFromNow(7),
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
    deadline: daysFromNow(3),
    options: [
      { id: "o1", label: "삼겹살", votes: 5 },
      { id: "o2", label: "치킨+맥주", votes: 4 },
      { id: "o3", label: "마라탕", votes: 1 },
    ],
  },
];

// v2: 고정 마감일 시드로 저장된 구버전(전부 마감됨)을 버리고 새 시드로 시작한다.
const POLLS_KEY = "polls.v2";

// 구버전(단일 투표) 저장분을 목록 형태로 흡수한다.
function migratePolls(): Poll[] {
  const legacy = read<Poll | null>("poll.festival-2026", null);
  const merged = SEED_POLLS.map((p) => (legacy && p.id === legacy.id ? { ...legacy, deadline: p.deadline } : p));
  if (legacy) {
    // 병합 결과를 먼저 영속화한 뒤에 구키를 제거해야 재방문 시 투표 기록이 유실되지 않는다.
    write(POLLS_KEY, merged);
    try {
      localStorage.removeItem(NS + "poll.festival-2026");
    } catch {
      /* 무시 */
    }
  }
  return merged;
}

// 단일 선택 시절 저장분(votedOptionId)을 votedOptionIds 로 옮긴다.
function normalize(p: Poll & { votedOptionId?: string | null }): Poll {
  const { votedOptionId, ...rest } = p;
  if (rest.votedOptionIds || !votedOptionId) return rest;
  return { ...rest, votedOptionIds: [votedOptionId] };
}

export interface NewPoll {
  title: string;
  options: string[];
  deadline: string;
  multiple: boolean;
  total: number;
}

export const pollStore = {
  loadAll(): Poll[] {
    const stored = read<Poll[] | null>(POLLS_KEY, null);
    if (stored && stored.length > 0) return stored.map(normalize);
    return migratePolls().map(normalize);
  },
  saveAll(polls: Poll[]): void {
    write(POLLS_KEY, polls);
  },
  // 단일 선택 투표는 선택지 1개만 받는다. 이미 참여했거나 마감이면 그대로 둔다(취소 후 재투표).
  vote(polls: Poll[], pollId: string, optionIds: string[]): Poll[] {
    const next = polls.map((p) => {
      if (p.id !== pollId || hasVoted(p) || isClosed(p)) return p;
      const picked = [...new Set(optionIds)].filter((id) => p.options.some((o) => o.id === id));
      if (picked.length === 0 || (!p.multiple && picked.length > 1)) return p;
      return {
        ...p,
        voters: voterCount(p) + 1,
        votedOptionIds: picked,
        options: p.options.map((o) => (picked.includes(o.id) ? { ...o, votes: o.votes + 1 } : o)),
      };
    });
    this.saveAll(next);
    return next;
  },
  // 내 투표를 취소한다(마감 전까지). 취소하면 다시 투표할 수 있다.
  cancel(polls: Poll[], pollId: string): Poll[] {
    const next = polls.map((p) => {
      if (p.id !== pollId || !hasVoted(p) || isClosed(p)) return p;
      const mine = p.votedOptionIds ?? [];
      return {
        ...p,
        voters: Math.max(0, voterCount(p) - 1),
        votedOptionIds: [],
        options: p.options.map((o) => (mine.includes(o.id) ? { ...o, votes: Math.max(0, o.votes - 1) } : o)),
      };
    });
    this.saveAll(next);
    return next;
  },
  create(polls: Poll[], input: NewPoll, createdBy: string): Poll[] {
    const poll: Poll = {
      id: `p${Date.now()}`,
      title: input.title.trim(),
      owner: createdBy,
      createdBy,
      total: input.total,
      deadline: input.deadline,
      multiple: input.multiple,
      voters: 0,
      votedOptionIds: [],
      options: input.options.map((label, i) => ({ id: `o${i + 1}`, label: label.trim(), votes: 0 })),
    };
    const next = [poll, ...polls];
    this.saveAll(next);
    return next;
  },
  remove(polls: Poll[], pollId: string): Poll[] {
    const next = polls.filter((p) => p.id !== pollId);
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

export function hasVoted(poll: Poll): boolean {
  return (poll.votedOptionIds?.length ?? 0) > 0;
}

// 참여 인원. 단일 선택은 득표 합과 같고, 복수 선택은 따로 센 값을 쓴다.
export function voterCount(poll: Poll): number {
  return poll.voters ?? totalVotes(poll);
}

// 비율의 분모: 단일 선택은 전체 득표, 복수 선택은 참여 인원(선택지별 합이 100%를 넘을 수 있음).
export function percent(poll: Poll, optionId: string, precomputedTotal?: number): number {
  const total = precomputedTotal ?? (poll.multiple ? voterCount(poll) : totalVotes(poll));
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
