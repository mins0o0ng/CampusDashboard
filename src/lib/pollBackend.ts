// pollBackend.ts
// 용도: 투표 저장소를 한 인터페이스로 감싼다.
//   - Supabase 설정 시: 모든 사용자가 같은 투표를 보고, 규칙(1인 1회·단일/복수 선택·마감)은 DB 함수가 강제한다.
//   - 미설정 시: 기존 localStorage 저장(이 브라우저에서만 보임).
// PollWidget 은 어느 쪽인지 몰라도 되도록 모든 동작이 갱신된 목록을 Promise 로 돌려준다.

import type { Poll } from "../types";
import { pollStore, type NewPoll } from "./store";
import { ensureSession, supabase } from "./supabase";

export interface PollBackend {
  shared: boolean; // true = 다른 사용자와 공유됨
  list(): Promise<Poll[]>;
  vote(polls: Poll[], pollId: string, optionIds: string[]): Promise<Poll[]>;
  cancel(polls: Poll[], pollId: string): Promise<Poll[]>;
  create(polls: Poll[], input: NewPoll, owner: string): Promise<Poll[]>;
  remove(polls: Poll[], pollId: string): Promise<Poll[]>;
}

const localBackend: PollBackend = {
  shared: false,
  list: async () => pollStore.loadAll(),
  vote: async (polls, id, ids) => pollStore.vote(polls, id, ids),
  cancel: async (polls, id) => pollStore.cancel(polls, id),
  create: async (polls, input, owner) => pollStore.create(polls, input, owner),
  remove: async (polls, id) => pollStore.remove(polls, id),
};

// DB 함수가 던진 예외 메시지(한국어)를 그대로 화면에 보여 준다.
async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

async function remoteList(): Promise<Poll[]> {
  await ensureSession(); // 내 투표(votedOptionIds)·내가 만든 투표(mine)를 알려면 세션이 필요하다
  return ((await rpc("get_polls")) as Poll[]) ?? [];
}

const remoteBackend: PollBackend = {
  shared: true,
  list: remoteList,
  async vote(_polls, pollId, optionIds) {
    await ensureSession();
    await rpc("cast_vote", { p_poll: pollId, p_options: optionIds });
    return remoteList();
  },
  async cancel(_polls, pollId) {
    await ensureSession();
    await rpc("cancel_vote", { p_poll: pollId });
    return remoteList();
  },
  async create(_polls, input, owner) {
    await ensureSession();
    await rpc("create_poll", {
      p_title: input.title,
      p_owner: owner || "익명",
      p_options: input.options,
      p_deadline: input.deadline,
      p_multiple: input.multiple,
      p_total: input.total,
    });
    return remoteList();
  },
  async remove(_polls, pollId) {
    await ensureSession();
    await rpc("delete_poll", { p_poll: pollId });
    return remoteList();
  },
};

export const pollBackend: PollBackend = supabase ? remoteBackend : localBackend;
