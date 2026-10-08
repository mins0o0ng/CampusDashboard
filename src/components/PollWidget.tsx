import React, { useState, useCallback, useMemo, useEffect } from "react";
import type { Poll } from "../types";
import { pollStore, percent, totalVotes, voterCount, hasVoted, dday, isClosed, type NewPoll } from "../lib/store";
import { pollBackend } from "../lib/pollBackend";

function deadlineLabel(poll: Poll): string {
  if (isClosed(poll)) return "마감됨";
  const remain = dday(poll);
  return remain === 0 ? "D-Day" : `마감 D-${remain}`;
}

function participation(poll: Poll): string {
  const n = voterCount(poll);
  return poll.total > 0 ? `${poll.total}명 중 ${n}명 참여` : `${n}명 참여`;
}

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ==================== 새 투표 만들기 ==================== */

const MAX_OPTIONS = 8;

const CreatePollForm: React.FC<{ onCreate: (p: NewPoll) => void; onCancel: () => void }> = ({ onCreate, onCancel }) => {
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [deadline, setDeadline] = useState(() => daysFromToday(7));
  const [multiple, setMultiple] = useState(false);
  const [total, setTotal] = useState("");

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const valid = title.trim() && filled.length >= 2 && new Set(filled).size === filled.length && deadline >= daysFromToday(0);

  return (
    <div className="space-y-2.5">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="투표 제목 (예: 동아리 MT 장소)"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
      />
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              value={o}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`선택지 ${i + 1}`}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px]"
            />
            {options.length > 2 && (
              <button
                onClick={() => setOptions(options.filter((_, j) => j !== i))}
                aria-label={`선택지 ${i + 1} 삭제`}
                className="w-7 text-gray-300 hover:text-red-500"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {options.length < MAX_OPTIONS && (
          <button onClick={() => setOptions([...options, ""])} className="text-[11px] text-amber-600 font-medium">
            + 선택지 추가
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="text-[11px] text-gray-500 flex items-center gap-1.5">
          마감일
          <input type="date" value={deadline} min={daysFromToday(0)} onChange={(e) => setDeadline(e.target.value)} className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px]" />
        </label>
        <label className="text-[11px] text-gray-500 flex items-center gap-1.5">
          대상 인원
          <input
            type="number"
            min={0}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="선택"
            className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-[11px]"
          />
        </label>
        <label className="text-[11px] text-gray-700 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-amber-500" />
          복수 선택 허용
        </label>
      </div>
      {filled.length >= 2 && new Set(filled).size !== filled.length && <p className="text-[11px] text-red-500">같은 선택지가 있어요.</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
        <button
          disabled={!valid}
          onClick={() => onCreate({ title, options: filled, deadline, multiple, total: Math.max(0, Number(total) || 0) })}
          className="text-[13px] bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
        >
          만들기
        </button>
      </div>
    </div>
  );
};

/* ==================== 투표 위젯 ==================== */

interface Props {
  userName: string; // 새 투표의 주최자·작성자로 기록
}

export const PollWidget: React.FC<Props> = ({ userName }) => {
  // 공유 모드(Supabase)는 서버에서 불러오고, 아니면 이 브라우저 저장분으로 바로 시작한다.
  const [polls, setPolls] = useState<Poll[]>(() => (pollBackend.shared ? [] : pollStore.loadAll()));
  const [loading, setLoading] = useState(pollBackend.shared);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 빈 문자열이면 아래 useMemo 가 첫 번째 투표로 폴백한다 — loadAll 중복 호출 방지.
  const [activeId, setActiveId] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [modal, setModal] = useState<"list" | "create" | null>(null);

  const poll = useMemo(() => polls.find((p) => p.id === activeId) ?? polls[0], [polls, activeId]);

  const voted = poll ? hasVoted(poll) : false;
  const closed = poll ? isClosed(poll) : false;
  const showResult = voted || closed;
  const denom = useMemo(() => (poll ? (poll.multiple ? voterCount(poll) : totalVotes(poll)) : 0), [poll]);

  const toggle = useCallback(
    (optionId: string) => {
      if (!poll) return;
      setSelected((prev) =>
        poll.multiple ? (prev.includes(optionId) ? prev.filter((x) => x !== optionId) : [...prev, optionId]) : [optionId]
      );
    },
    [poll]
  );

  // 모든 쓰기는 갱신된 목록을 돌려준다. 서버 규칙 위반(이미 투표함·마감 등)은 메시지로 보여 준다.
  const run = useCallback(async (action: () => Promise<Poll[]>): Promise<Poll[] | null> => {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setPolls(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청에 실패했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // 공유 모드: 처음 열 때와 탭으로 돌아올 때 다른 사람의 투표를 반영한다.
  useEffect(() => {
    if (!pollBackend.shared) return;
    const refresh = () =>
      pollBackend
        .list()
        .then((next) => {
          setPolls(next);
          setError("");
        })
        .catch((e) => setError(e instanceof Error ? e.message : "투표를 불러오지 못했습니다."))
        .finally(() => setLoading(false));
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const submit = useCallback(async () => {
    if (!poll || selected.length === 0) return;
    if (await run(() => pollBackend.vote(polls, poll.id, selected))) setSelected([]);
  }, [polls, poll, selected, run]);

  const cancel = useCallback(async () => {
    if (!poll || !window.confirm("투표를 취소할까요? 취소하면 다시 투표할 수 있어요.")) return;
    if (await run(() => pollBackend.cancel(polls, poll.id))) setSelected([]);
  }, [polls, poll, run]);

  const pickPoll = useCallback((id: string) => {
    setActiveId(id);
    setSelected([]);
    setModal(null);
  }, []);

  const create = useCallback(
    async (input: NewPoll) => {
      const next = await run(() => pollBackend.create(polls, input, userName));
      if (next?.[0]) pickPoll(next[0].id);
    },
    [polls, userName, pickPoll, run]
  );

  const remove = useCallback(
    async (p: Poll) => {
      if (!window.confirm(`'${p.title}' 투표를 삭제할까요?`)) return;
      const next = await run(() => pollBackend.remove(polls, p.id));
      if (next && p.id === poll?.id) setActiveId("");
    },
    [polls, poll, run]
  );

  const isMine = (p: Poll) => p.mine === true || (!!p.createdBy && p.createdBy === userName);

  if (!poll) {
    return (
      <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
        <header className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">투표</h3>
        </header>
        {loading ? (
          <p className="text-[12px] text-gray-400 py-6 text-center">불러오는 중…</p>
        ) : (
          <div className="py-4 text-center">
            <p className="text-[12px] text-gray-500">아직 진행 중인 투표가 없어요.</p>
            <button onClick={() => setModal("create")} className="mt-2 text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-3 py-1.5">
              + 새 투표 만들기
            </button>
          </div>
        )}
        {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
        {modal === "create" && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setModal(null)}>
            <div className="bg-white rounded-xl p-5 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h4 className="text-sm font-bold text-gray-800 mb-3">새 투표 만들기</h4>
              <CreatePollForm onCreate={create} onCancel={() => setModal(null)} />
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-800 truncate">{poll.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2.5 py-1">{poll.owner}</span>
          <button
            onClick={() => setModal("list")}
            aria-label="모든 투표 보기"
            className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-300 text-sm leading-none grid place-items-center"
          >+</button>
        </div>
      </header>

      {poll.multiple && !showResult && <p className="text-[10px] text-amber-600 mb-1.5">복수 선택 가능</p>}

      <div className="space-y-2">
        {poll.options.map((o) => {
          const p = percent(poll, o.id, denom);
          const mine = poll.votedOptionIds?.includes(o.id) ?? false;
          if (showResult) {
            return (
              <div key={o.id}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className={`${mine ? "font-bold text-amber-600" : "text-gray-900"}`}>
                    {o.label}{mine && " ✓"}
                  </span>
                  <span className="font-bold text-gray-500">{p}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={mine ? "h-full bg-amber-500" : "h-full bg-amber-300"} style={{ width: `${p}%` }} />
                </div>
              </div>
            );
          }
          const on = selected.includes(o.id);
          return (
            <button
              key={o.id}
              onClick={() => toggle(o.id)}
              aria-pressed={on}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
                on ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              {poll.multiple ? (
                <span className={`w-4 h-4 rounded border-2 grid place-items-center text-[10px] leading-none ${on ? "border-amber-500 bg-amber-500 text-white" : "border-gray-300 text-transparent"}`}>✓</span>
              ) : (
                <span className={`w-4 h-4 rounded-full border-2 grid place-items-center ${on ? "border-amber-500" : "border-gray-300"}`}>
                  {on && <span className="w-2 h-2 rounded-full bg-amber-500" />}
                </span>
              )}
              <span className="text-[13px] text-gray-900">{o.label}</span>
            </button>
          );
        })}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">
          {participation(poll)} · {deadlineLabel(poll)}
        </p>
        {!showResult && (
          <button
            onClick={submit}
            disabled={selected.length === 0 || busy}
            className="text-[12px] bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
          >
            {poll.multiple && selected.length > 1 ? `${selected.length}개 투표하기` : "투표하기"}
          </button>
        )}
        {voted && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-amber-600">투표 완료 ✓</span>
            {!closed && (
              <button onClick={cancel} disabled={busy} className="text-[11px] text-gray-400 hover:text-red-500 underline">
                투표 취소
              </button>
            )}
          </div>
        )}
      </footer>
      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-white rounded-xl p-5 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {modal === "create" ? (
              <>
                <h4 className="text-sm font-bold text-gray-800 mb-3">새 투표 만들기</h4>
                <CreatePollForm onCreate={create} onCancel={() => setModal("list")} />
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-800">모든 투표</h4>
                  <button onClick={() => setModal("create")} className="text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-3 py-1">
                    + 새 투표 만들기
                  </button>
                </div>
                <ul className="space-y-1.5 max-h-80 overflow-auto">
                  {polls.map((p) => (
                    <li key={p.id} className="flex items-stretch gap-1">
                      <button
                        onClick={() => pickPoll(p.id)}
                        className={`flex-1 min-w-0 rounded-lg border px-3 py-2.5 text-left ${
                          p.id === poll.id ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-gray-900 truncate">{p.title}</span>
                          {hasVoted(p) && <span className="shrink-0 text-[10px] font-semibold text-amber-600">참여함 ✓</span>}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {p.owner} · {voterCount(p)}명 참여 · {deadlineLabel(p)}
                          {p.multiple && " · 복수 선택"}
                        </p>
                      </button>
                      {isMine(p) && (
                        <button onClick={() => remove(p)} aria-label={`${p.title} 삭제`} className="px-2 text-[11px] text-gray-300 hover:text-red-500">
                          삭제
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end mt-3">
                  <button onClick={() => setModal(null)} className="text-[13px] text-gray-500 px-3 py-1.5">닫기</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PollWidget;
