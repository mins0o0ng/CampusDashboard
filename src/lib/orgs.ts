// orgs.ts
// 용도: 소속(과·동아리·수업그룹) 목록의 localStorage 스토어.
//       사이드바(관리 UI)와 시간표(강의별 소속 표시)가 공유한다.

import type { Org } from "../types";

const KEY = "campus.orgs";

const SEED_ORGS: Org[] = [
  { id: "org-personal", name: "개인", color: "amber" },
  { id: "org-cs", name: "컴퓨터공학과", color: "indigo" },
  { id: "org-club", name: "블로우파이프 동아리", color: "red" },
  { id: "org-capstone", name: "캡스톤 디자인 4조", color: "green" },
];

function read(): Org[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Org[]) : null;
    return parsed && parsed.length > 0 ? parsed : SEED_ORGS;
  } catch {
    return SEED_ORGS;
  }
}

function write(orgs: Org[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(orgs));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export const orgStore = {
  load(): Org[] {
    return read();
  },
  add(orgs: Org[], org: Omit<Org, "id">): Org[] {
    const next = [...orgs, { ...org, id: `org-${Date.now()}` }];
    write(next);
    return next;
  },
  update(orgs: Org[], org: Org): Org[] {
    const next = orgs.map((o) => (o.id === org.id ? org : o));
    write(next);
    return next;
  },
  remove(orgs: Org[], id: string): Org[] {
    const next = orgs.filter((o) => o.id !== id);
    write(next);
    return next;
  },
};
