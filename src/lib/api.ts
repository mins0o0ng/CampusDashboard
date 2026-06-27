// api.ts
// 용도: 백엔드(FastAPI) 연동 클라이언트. store.ts 의 localStorage 목과 동일한 의미의
//       함수를 서버 호출로 제공한다. 시간표는 서버 영속, 투표는 서버측 1인 1표.
// 사용법:
//   import { timetableApi, pollApi } from "./lib/api";
//   const classes = await timetableApi.list();
//   const poll = await pollApi.vote("festival-2026", "o1");
// 환경변수 VITE_API_BASE 로 백엔드 주소 지정(기본 http://localhost:8000).

import type { ClassBlock, Poll } from "../types";

const BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:8000";

// 사용자 식별자(데모): 브라우저별 1회 발급해 보관. 서버는 이 값으로 1인 1표를 강제한다.
// 실제 서비스에서는 학교 SSO/JWT 로 대체.
function getUserId(): string {
  const KEY = "campus.uid";
  let uid = localStorage.getItem(KEY);
  if (!uid) {
    uid = "u_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(KEY, uid);
  }
  return uid;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getUserId(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // 서버 에러 메시지(detail)를 그대로 올려 UI 에서 처리(예: 409 이미 투표함)
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* 본문 없음 */
    }
    throw new ApiError(res.status, detail);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/* ============================ 시간표 API ============================ */

export const timetableApi = {
  list: () => req<ClassBlock[]>("/api/timetable"),
  add: (block: Omit<ClassBlock, "id">) =>
    req<ClassBlock>("/api/timetable", { method: "POST", body: JSON.stringify(block) }),
  update: (block: ClassBlock) =>
    req<ClassBlock>(`/api/timetable/${block.id}`, { method: "PUT", body: JSON.stringify(block) }),
  remove: (id: string) => req<void>(`/api/timetable/${id}`, { method: "DELETE" }),
};

/* ============================ 투표 API ============================ */

export const pollApi = {
  get: (pollId: string) => req<Poll>(`/api/poll/${pollId}`),
  // 성공 시 갱신된 Poll, 중복/마감 시 ApiError(409) 를 throw → UI 에서 안내.
  vote: (pollId: string, optionId: string) =>
    req<Poll>(`/api/poll/${pollId}/vote`, { method: "POST", body: JSON.stringify({ option_id: optionId }) }),
};

/* ============================ 공지 / 학식 API ============================ */

export const dataApi = {
  notices: (keyword?: string) =>
    req<{ count: number; notices: any[]; scraped_at?: string }>(
      "/api/notices" + (keyword ? `?keyword=${encodeURIComponent(keyword)}` : "")
    ),
  meal: () => req<{ day: string | null; meals: any[] }>("/api/meal"),
};
