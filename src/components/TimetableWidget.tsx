// TimetableWidget.tsx
// 용도: 인터랙티브 시간표 위젯. 강의 추가/수정/삭제 + localStorage 저장.
//       빈 칸 클릭 → 추가 폼, 강의 블록 클릭 → 수정/삭제 폼.
// 사용법: <TimetableWidget />  (props 없이 동작, 내부에서 store 로드)

import React, { useState } from "react";
import type { ClassBlock, DayIndex, WidgetColor } from "../types";
import { timetableStore } from "../lib/store";

const DAYS = ["월", "화", "수", "목", "금"];
const HOUR_START = 9;
const HOUR_END = 18;
const COLORS: Record<WidgetColor, { bg: string; text: string; ring: string }> = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-200" },
  red: { bg: "bg-red-50", text: "text-red-500", ring: "ring-red-200" },
  green: { bg: "bg-green-50", text: "text-green-600", ring: "ring-green-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200" },
};

// 편집 폼 상태(신규 추가 또는 기존 수정)
interface EditState {
  block: ClassBlock;
  isNew: boolean;
}

const emptyBlock = (day: DayIndex, start: number): ClassBlock => ({
  id: "",
  subject: "",
  room: "",
  day,
  start,
  end: start + 1,
  color: "indigo",
});

export const TimetableWidget: React.FC = () => {
  const [classes, setClasses] = useState<ClassBlock[]>(() => timetableStore.load());
  const [edit, setEdit] = useState<EditState | null>(null);

  const openNew = (day: DayIndex, start: number) =>
    setEdit({ block: emptyBlock(day, start), isNew: true });
  const openEdit = (block: ClassBlock) => setEdit({ block, isNew: false });

  const save = () => {
    if (!edit) return;
    const b = edit.block;
    if (!b.subject.trim() || b.end <= b.start) return; // 최소 검증
    setClasses(edit.isNew ? timetableStore.add(classes, b) : timetableStore.update(classes, b));
    setEdit(null);
  };

  const remove = () => {
    if (!edit || edit.isNew) return;
    setClasses(timetableStore.remove(classes, edit.block.id));
    setEdit(null);
  };

  const rows = HOUR_END - HOUR_START;

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-800">시간표</h3>
        </div>
        <span className="text-[11px] font-semibold text-gray-400">2026-1학기 · 빈 칸 클릭해 추가</span>
      </header>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1 mb-1">
        <div />
        {DAYS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-500 text-center">{d}</div>
        ))}
      </div>

      {/* 그리드 본체 */}
      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1">
        {/* 시간 레이블 컬럼 */}
        <div className="flex flex-col">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-9 text-[9px] text-gray-300 text-right pr-1 leading-9">
              {HOUR_START + i}
            </div>
          ))}
        </div>

        {/* 요일별 컬럼 */}
        {DAYS.map((_, dayIdx) => (
          <div key={dayIdx} className="relative">
            {/* 클릭 가능한 빈 슬롯 */}
            {Array.from({ length: rows }).map((_, i) => (
              <button
                key={i}
                onClick={() => openNew(dayIdx as DayIndex, HOUR_START + i)}
                className="block w-full h-9 border-t border-gray-100 hover:bg-indigo-50/40"
                aria-label={`${DAYS[dayIdx]} ${HOUR_START + i}시 강의 추가`}
              />
            ))}
            {/* 강의 블록(절대 위치) */}
            {classes
              .filter((c) => c.day === dayIdx)
              .map((c) => {
                const top = (c.start - HOUR_START) * 36; // 1시간 = 36px(h-9)
                const height = (c.end - c.start) * 36 - 2;
                const col = COLORS[c.color];
                return (
                  <button
                    key={c.id}
                    onClick={() => openEdit(c)}
                    className={`absolute left-0 right-0 rounded-lg px-1.5 py-1 text-left overflow-hidden ring-1 ${col.bg} ${col.ring}`}
                    style={{ top, height }}
                  >
                    <p className={`text-[10px] font-semibold leading-tight ${col.text}`}>{c.subject}</p>
                    {c.room && <p className="text-[9px] text-gray-400 truncate">{c.room}</p>}
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      {/* 편집 모달 */}
      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-xl p-5 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-gray-800 mb-3">{edit.isNew ? "강의 추가" : "강의 수정"}</h4>
            <div className="space-y-2.5">
              <input
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                placeholder="과목명"
                value={edit.block.subject}
                onChange={(e) => setEdit({ ...edit, block: { ...edit.block, subject: e.target.value } })}
              />
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                placeholder="강의실 (선택)"
                value={edit.block.room ?? ""}
                onChange={(e) => setEdit({ ...edit, block: { ...edit.block, room: e.target.value } })}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-[13px]"
                  value={edit.block.day}
                  onChange={(e) => setEdit({ ...edit, block: { ...edit.block, day: Number(e.target.value) as DayIndex } })}
                >
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}요일</option>)}
                </select>
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-[13px]"
                  value={edit.block.start}
                  onChange={(e) => { const s = Number(e.target.value); setEdit({ ...edit, block: { ...edit.block, start: s, end: Math.max(edit.block.end, s + 1) } }); }}
                >
                  {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => <option key={i} value={HOUR_START + i}>{HOUR_START + i}시</option>)}
                </select>
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-[13px]"
                  value={edit.block.end}
                  onChange={(e) => setEdit({ ...edit, block: { ...edit.block, end: Number(e.target.value) } })}
                >
                  {Array.from({ length: HOUR_END - HOUR_START }).map((_, i) => HOUR_START + 1 + i).filter((h) => h > edit.block.start).map((h) => <option key={h} value={h}>{h}시</option>)}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                {(Object.keys(COLORS) as WidgetColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setEdit({ ...edit, block: { ...edit.block, color: c } })}
                    className={`w-7 h-7 rounded-full ${COLORS[c].bg} ${COLORS[c].text} ${edit.block.color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
                  >●</button>
                ))}
              </div>
            </div>
            <div className="flex justify-between mt-4">
              {!edit.isNew ? (
                <button onClick={remove} className="text-[13px] text-red-500 font-medium">삭제</button>
              ) : <span />}
              <div className="flex gap-2">
                <button onClick={() => setEdit(null)} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
                <button onClick={save} className="text-[13px] bg-indigo-600 text-white rounded-lg px-4 py-1.5 font-medium">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TimetableWidget;
