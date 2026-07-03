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
  { id: "c1", subject: "알고리즘", room: "IT4-301", day: 0, start: 9, end: 11, color: "indigo" },
  { id: "c2", subject: "운영체제", room: "공대 211", day: 2, start: 9, end: 10, color: "red" },
  { id: "c3", subject: "소프트웨어공학", room: "IT1-103", day: 1, start: 11, end: 12, color: "amber" },
  { id: "c4", subject: "DB설계", room: "IT2-205", day: 3, start: 11, end: 13, color: "green" },
  { id: "c5", subject: "캡스톤디자인", room: "IT4-401", day: 4, start: 9, end: 10, color: "indigo" },
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

const SEED_POLL: Poll = {
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
};

export const pollStore = {
  load(): Poll {
    return read<Poll>("poll." + SEED_POLL.id, SEED_POLL);
  },
  save(poll: Poll): void {
    write("poll." + poll.id, poll);
  },
  vote(poll: Poll, optionId: string): Poll {
    if (poll.votedOptionId) return poll;
    if (isClosed(poll)) return poll;
    const next: Poll = {
      ...poll,
      votedOptionId: optionId,
      options: poll.options.map((o) =>
        o.id === optionId ? { ...o, votes: o.votes + 1 } : o
      ),
    };
    this.save(next);
    return next;
  },
};

/* ============================ 파생 유틸 ============================ */

function todayMidnight(): Date {
  return new Date(new Date().toDateString());
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
  return new Date(poll.deadline) < todayMidnight();
}

export function dday(poll: Poll): number {
  const ms = new Date(poll.deadline).getTime() - todayMidnight().getTime();
  return Math.ceil(ms / 86_400_000);
}
