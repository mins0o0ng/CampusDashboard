// store.ts
// 용도: 시간표·투표 데이터 계층. 현재는 localStorage 기반 목(mock) 구현이지만,
//       동일한 함수 시그니처를 서버 API(fetch)로 교체하면 백엔드 연동으로 바로 승격된다.
//       → "자체DB" 기능의 프런트 계약(contract)을 먼저 고정하는 목적.
// 사용법:
//   import { timetableStore, pollStore } from "./lib/store";
//   const classes = timetableStore.load();
//   pollStore.vote(poll, optionId);

import type { ClassBlock, Poll } from "../types";

const NS = "campus."; // localStorage 키 접두사

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
    /* 저장 실패(프라이빗 모드 등)는 무시 — 메모리 상태는 유지 */
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
  deadline: "2026-06-29",
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
  // 투표하기: 중복 투표 방지 + 마감 검사. 결과 Poll 반환.
  vote(poll: Poll, optionId: string): Poll {
    if (poll.votedOptionId) return poll;          // 이미 투표함
    if (isClosed(poll)) return poll;              // 마감됨
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

// 총 득표수
export function totalVotes(poll: Poll): number {
  return poll.options.reduce((s, o) => s + o.votes, 0);
}

// 선택지 백분율(정수). 득표 0이면 0.
export function percent(poll: Poll, optionId: string): number {
  const total = totalVotes(poll);
  if (total === 0) return 0;
  const v = poll.options.find((o) => o.id === optionId)?.votes ?? 0;
  return Math.round((v / total) * 100);
}

// 마감 여부
export function isClosed(poll: Poll): boolean {
  return new Date(poll.deadline) < new Date(new Date().toDateString());
}

// D-day (남은 일수). 음수면 마감 경과.
export function dday(poll: Poll): number {
  const ms = new Date(poll.deadline).getTime() - new Date(new Date().toDateString()).getTime();
  return Math.ceil(ms / 86_400_000);
}
