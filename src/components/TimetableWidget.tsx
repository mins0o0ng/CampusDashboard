import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ClassBlock, DayIndex, Org, WidgetColor } from "../types";
import { timetableStore } from "../lib/store";

const DAYS = ["월", "화", "수", "목", "금"];
const HOUR_START = 9;
const HOUR_END = 18;
const HOURS = HOUR_END - HOUR_START;
const COLORS: Record<WidgetColor, { bg: string; text: string; ring: string }> = {
  indigo: { bg: "bg-indigo-50", text: "text-indigo-600", ring: "ring-indigo-200" },
  red: { bg: "bg-red-50", text: "text-red-500", ring: "ring-red-200" },
  green: { bg: "bg-green-50", text: "text-green-600", ring: "ring-green-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-200" },
};
const COLOR_KEYS = Object.keys(COLORS) as WidgetColor[];
const HOUR_SLOTS = Array.from({ length: HOURS }, (_, i) => i);
const SLOT_PX = 36; // 1시간 칸 높이(h-9)
const STEP = 0.5; // 드래그·편집 단위: 30분
const START_OPTIONS = Array.from({ length: HOURS / STEP }, (_, i) => HOUR_START + i * STEP);
const DRAG_THRESHOLD_PX = 4; // 이보다 적게 움직이면 클릭(편집 창)으로 본다

// 9.5 → "9:30"
function hm(h: number): string {
  return `${Math.floor(h)}:${h % 1 ? "30" : "00"}`;
}

const snap = (h: number) => Math.round(h / STEP) * STEP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type DragMode = "move" | "top" | "bottom";

interface DragState {
  id: string;
  mode: DragMode;
  x: number; // 시작 포인터 위치
  y: number;
  orig: ClassBlock;
  preview: ClassBlock;
  moved: boolean;
}

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
  end: Math.min(start + 1, HOUR_END),
  color: "indigo",
});

interface Props {
  orgs: Org[];
}

export const TimetableWidget: React.FC<Props> = ({ orgs }) => {
  const [classes, setClasses] = useState<ClassBlock[]>(() => timetableStore.load());
  const findOrg = useCallback(
    (id?: string) => (id ? orgs.find((o) => o.id === id) : undefined),
    [orgs]
  );
  const [edit, setEdit] = useState<EditState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const suppressClick = useRef(false); // 드래그 직후 따라오는 click 으로 편집 창이 뜨지 않게

  /* ---------- 드래그: 몸통=이동(요일·시간), 위/아래 모서리=시간 늘이기·줄이기 ---------- */

  const startDrag = useCallback((e: React.PointerEvent, c: ClassBlock, mode: DragMode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setDrag({ id: c.id, mode, x: e.clientX, y: e.clientY, orig: c, preview: c, moved: false });
  }, []);

  // 포인터 x 가 놓인 요일 칸(칸 밖이면 가장 가까운 칸)
  const dayAt = useCallback((clientX: number): DayIndex | null => {
    let best: { day: number; dist: number } | null = null;
    colRefs.current.forEach((el, day) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (!best || dist < best.dist) best = { day, dist };
    });
    return best ? ((best as { day: number }).day as DayIndex) : null;
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const moved = drag.moved || Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX;
      if (!moved) return;
      const dh = snap(dy / SLOT_PX);
      const o = drag.orig;
      let preview: ClassBlock;
      if (drag.mode === "move") {
        const len = o.end - o.start;
        const start = clamp(o.start + dh, HOUR_START, HOUR_END - len);
        preview = { ...o, start, end: start + len, day: dayAt(e.clientX) ?? o.day };
      } else if (drag.mode === "top") {
        preview = { ...o, start: clamp(o.start + dh, HOUR_START, o.end - STEP) };
      } else {
        preview = { ...o, end: clamp(o.end + dh, o.start + STEP, HOUR_END) };
      }
      setDrag((d) => (d ? { ...d, moved: true, preview } : d));
    };
    const onUp = () => {
      if (drag.moved) {
        // pointerup 직후 같은 요소에 오는 click 만 무시한다. 다른 요일로 옮겨져 click 이 안 오면
        // 다음 진짜 클릭까지 막히지 않도록 곧바로 해제한다.
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 0);
        const p = drag.preview;
        const o = drag.orig;
        if (p.day !== o.day || p.start !== o.start || p.end !== o.end) {
          setClasses((prev) => timetableStore.update(prev, p));
        }
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, dayAt]);

  const openNew = useCallback((day: DayIndex, start: number) =>
    setEdit({ block: emptyBlock(day, start), isNew: true }), []);

  const openEdit = useCallback((block: ClassBlock) =>
    setEdit({ block, isNew: false }), []);

  const save = useCallback(() => {
    if (!edit) return;
    const b = edit.block;
    if (!b.subject.trim() || b.end <= b.start) return;
    const clamped = { ...b, end: Math.min(b.end, HOUR_END) };
    setClasses(edit.isNew ? timetableStore.add(classes, clamped) : timetableStore.update(classes, clamped));
    setEdit(null);
  }, [edit, classes]);

  const remove = useCallback(() => {
    if (!edit || edit.isNew) return;
    setClasses(timetableStore.remove(classes, edit.block.id));
    setEdit(null);
  }, [edit, classes]);

  const closeModal = useCallback(() => setEdit(null), []);

  const endOptions = useMemo(() => {
    if (!edit) return [];
    return Array.from({ length: HOURS / STEP }, (_, i) => HOUR_START + STEP + i * STEP)
      .filter((h) => h > edit.block.start && h <= HOUR_END);
  }, [edit?.block.start]);

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-800">시간표</h3>
        </div>
        <span className="text-[11px] font-semibold text-gray-400">빈 칸 클릭해 추가 · 블록 드래그로 이동, 위·아래 끝을 끌어 시간 조절</span>
      </header>

      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1 mb-1">
        <div />
        {DAYS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-gray-500 text-center">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1">
        <div className="flex flex-col">
          {HOUR_SLOTS.map((i) => (
            <div key={i} className="h-9 text-[9px] text-gray-300 text-right pr-1 leading-9">
              {HOUR_START + i}
            </div>
          ))}
        </div>

        {DAYS.map((_, dayIdx) => (
          <div key={dayIdx} ref={(el) => (colRefs.current[dayIdx] = el)} className="relative">
            {HOUR_SLOTS.map((i) => (
              <button
                key={i}
                onClick={() => openNew(dayIdx as DayIndex, HOUR_START + i)}
                className="block w-full h-9 border-t border-gray-100 hover:bg-indigo-50/40"
                aria-label={`${DAYS[dayIdx]} ${HOUR_START + i}시 강의 추가`}
              />
            ))}
            {classes
              .map((c) => (drag?.id === c.id ? drag.preview : c))
              .filter((c) => c.day === dayIdx)
              .map((c) => {
                const clampedEnd = Math.min(c.end, HOUR_END);
                const top = (c.start - HOUR_START) * SLOT_PX;
                const height = (clampedEnd - c.start) * SLOT_PX - 2;
                const col = COLORS[c.color] ?? COLORS.indigo;
                const dragging = drag?.id === c.id && drag.moved;
                const org = findOrg(c.orgId);
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.subject} ${DAYS[c.day]} ${hm(c.start)}~${hm(clampedEnd)} — 드래그해 이동, 클릭해 수정`}
                    onPointerDown={(e) => startDrag(e, c, "move")}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      openEdit(c);
                    }}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openEdit(c))}
                    className={`group absolute left-0 right-0 rounded-lg px-1.5 py-1 text-left overflow-hidden ring-1 select-none touch-none ${col.bg} ${col.ring} ${
                      dragging ? "z-20 shadow-lg ring-2 opacity-90 cursor-grabbing" : "cursor-grab"
                    }`}
                    style={{ top, height }}
                  >
                    {/* 위·아래 모서리: 끌어서 시작/종료 시간 조절 */}
                    <div
                      onPointerDown={(e) => startDrag(e, c, "top")}
                      aria-hidden
                      className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-black/10 rounded-t-lg"
                    />
                    <div
                      onPointerDown={(e) => startDrag(e, c, "bottom")}
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 bg-black/10 rounded-b-lg"
                    />
                    <p className={`text-[10px] font-semibold leading-tight ${col.text}`}>{c.subject}</p>
                    {dragging && (
                      <p className="text-[9px] font-bold text-gray-600">
                        {DAYS[c.day]} {hm(c.start)}~{hm(clampedEnd)}
                      </p>
                    )}
                    {!dragging && org && (
                      <span
                        className="inline-block max-w-full truncate text-[8px] font-semibold text-white rounded-full px-1.5 py-px mt-0.5 leading-tight"
                        style={{ backgroundColor: org.color }}
                      >
                        {org.name}
                      </span>
                    )}
                    {!dragging && c.room && <p className="text-[9px] text-gray-400 truncate">{c.room}</p>}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={closeModal}>
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
                  onChange={(e) => { const s = Number(e.target.value); setEdit({ ...edit, block: { ...edit.block, start: s, end: Math.max(edit.block.end, s + STEP) } }); }}
                >
                  {START_OPTIONS.map((h) => <option key={h} value={h}>{hm(h)}</option>)}
                </select>
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-[13px]"
                  value={edit.block.end}
                  onChange={(e) => setEdit({ ...edit, block: { ...edit.block, end: Number(e.target.value) } })}
                >
                  {endOptions.map((h) => <option key={h} value={h}>{hm(h)}</option>)}
                </select>
              </div>
              <select
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-[13px]"
                value={edit.block.orgId ?? ""}
                onChange={(e) => setEdit({ ...edit, block: { ...edit.block, orgId: e.target.value || undefined } })}
              >
                <option value="">소속 없음 (개인)</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <div className="flex gap-2 pt-1">
                {COLOR_KEYS.map((c) => (
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
                <button onClick={closeModal} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
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
