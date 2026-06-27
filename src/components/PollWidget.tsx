import React, { useState, useCallback, useMemo } from "react";
import type { Poll } from "../types";
import { pollStore, percent, totalVotes, dday, isClosed } from "../lib/store";

export const PollWidget: React.FC = () => {
  const [poll, setPoll] = useState<Poll>(() => pollStore.load());
  const [selected, setSelected] = useState<string | null>(null);

  const voted = Boolean(poll.votedOptionId);
  const closed = isClosed(poll);
  const showResult = voted || closed;
  const remain = dday(poll);
  const total = useMemo(() => totalVotes(poll), [poll]);

  const submit = useCallback(() => {
    if (!selected) return;
    setPoll(pollStore.vote(poll, selected));
  }, [poll, selected]);

  const deadlineLabel = useMemo(() => {
    if (closed) return "마감됨";
    if (remain === 0) return "D-Day";
    return `마감 D-${remain}`;
  }, [closed, remain]);

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <h3 className="text-sm font-semibold text-gray-800">{poll.title}</h3>
        </div>
        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 rounded-full px-2.5 py-1">{poll.owner}</span>
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
          {poll.total}명 중 {total}명 참여 · {deadlineLabel}
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
    </section>
  );
};

export default PollWidget;
