import React, { useState, useCallback, useMemo } from "react";
import type { Poll } from "../types";
import { pollStore, percent, totalVotes, dday, isClosed } from "../lib/store";

function deadlineLabel(poll: Poll): string {
  if (isClosed(poll)) return "마감됨";
  const remain = dday(poll);
  return remain === 0 ? "D-Day" : `마감 D-${remain}`;
}

export const PollWidget: React.FC = () => {
  const [polls, setPolls] = useState<Poll[]>(() => pollStore.loadAll());
  // 빈 문자열이면 아래 useMemo 가 첫 번째 투표로 폴백한다 — loadAll 중복 호출 방지.
  const [activeId, setActiveId] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const poll = useMemo(
    () => polls.find((p) => p.id === activeId) ?? polls[0],
    [polls, activeId]
  );

  const voted = Boolean(poll?.votedOptionId);
  const closed = poll ? isClosed(poll) : false;
  const showResult = voted || closed;
  const total = useMemo(() => (poll ? totalVotes(poll) : 0), [poll]);

  const submit = useCallback(() => {
    if (!poll || !selected) return;
    setPolls(pollStore.vote(polls, poll.id, selected));
    setSelected(null);
  }, [polls, poll, selected]);

  const pickPoll = useCallback((id: string) => {
    setActiveId(id);
    setSelected(null);
    setShowList(false);
  }, []);

  if (!poll) return null;

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
            onClick={() => setShowList(true)}
            aria-label="모든 투표 보기"
            className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-300 text-sm leading-none grid place-items-center"
          >+</button>
        </div>
      </header>

      <div className="space-y-2">
        {poll.options.map((o) => {
          const p = percent(poll, o.id, total);
          const mine = poll.votedOptionId === o.id;
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
          return (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left ${
                selected === o.id ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span className={`w-4 h-4 rounded-full border-2 grid place-items-center ${selected === o.id ? "border-amber-500" : "border-gray-300"}`}>
                {selected === o.id && <span className="w-2 h-2 rounded-full bg-amber-500" />}
              </span>
              <span className="text-[13px] text-gray-900">{o.label}</span>
            </button>
          );
        })}
      </div>

      <footer className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          {poll.total}명 중 {total}명 참여 · {deadlineLabel(poll)}
        </p>
        {!showResult && (
          <button
            onClick={submit}
            disabled={!selected}
            className="text-[12px] bg-amber-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
          >
            투표하기
          </button>
        )}
        {voted && <span className="text-[11px] font-semibold text-amber-600">투표 완료 ✓</span>}
      </footer>

      {showList && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowList(false)}>
          <div className="bg-white rounded-xl p-5 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-gray-800 mb-3">모든 투표</h4>
            <ul className="space-y-1.5 max-h-80 overflow-auto">
              {polls.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pickPoll(p.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                      p.id === poll.id ? "border-amber-400 bg-amber-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-gray-900 truncate">{p.title}</span>
                      {p.votedOptionId && <span className="shrink-0 text-[10px] font-semibold text-amber-600">참여함 ✓</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {p.owner} · {totalVotes(p)}명 참여 · {deadlineLabel(p)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end mt-3">
              <button onClick={() => setShowList(false)} className="text-[13px] text-gray-500 px-3 py-1.5">닫기</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default PollWidget;
