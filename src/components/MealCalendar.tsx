import React, { useCallback, useMemo, useState } from "react";
import type { MealSection } from "../lib/staticData";
import { shopNameStore, type Shop, type ShopNames } from "../lib/shops";
import MealImportDialog, { type ImportEntry } from "./MealImportDialog";
import {
  MEAL_SLOTS,
  countDrafts,
  dateKey,
  draftStore,
  exportJson,
  mergeTables,
  menuToText,
  parseMenuText,
  publishDrafts,
  publishShared,
  sharedMeals,
  tokenStore,
  type MealTable,
} from "../lib/mealManual";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

interface Props {
  shop: number;
  shops: Shop[]; // 알려진 모든 식당(기본 + 발견)
  onShopChange: (shop: number) => void;
  published: MealTable;
  publishedShops: ShopNames;
  drafts: MealTable;
  draftShopNames: ShopNames; // 이 브라우저에서 새로 발견한(게시 전) 식당 이름
  onDraftsChange: (drafts: MealTable) => void;
  onDraftShopNamesChange: (names: ShopNames) => void;
  onPublished: (days: MealTable, shops: ShopNames) => void;
  onClose: () => void;
}

// 월요일 시작 달력의 칸(앞뒤 빈칸 포함, 7의 배수).
function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 월=0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

/* ==================== 하루치 편집 ==================== */

interface EditorProps {
  day: string;
  shopName: string;
  initial: MealSection[];
  onSave: (sections: MealSection[]) => void;
  onClose: () => void;
}

const DayEditor: React.FC<EditorProps> = ({ day, shopName, initial, onSave, onClose }) => {
  const [fields, setFields] = useState(() =>
    MEAL_SLOTS.map((slot) => {
      const sec = initial.find((s) => s.meal === slot);
      return { slot, text: sec ? menuToText(sec.items) : "", time: sec?.items[0]?.time ?? "" };
    })
  );

  const update = (i: number, patch: Partial<{ text: string; time: string }>) =>
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const save = () => {
    const sections: MealSection[] = fields
      .map((f) => ({ meal: f.slot, items: parseMenuText(f.text, f.time.trim() || null) }))
      .filter((s) => s.items.length > 0);
    onSave(sections);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]"
      onClick={(e) => {
        e.stopPropagation(); // 바깥 달력 모달까지 닫히지 않도록
        onClose();
      }}
    >
      <div className="bg-white rounded-xl p-5 w-[24rem] max-h-[90vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800">{day} 식단 입력</h4>
        <p className="text-[11px] text-gray-400 mb-3">
          {shopName} · 한 줄에 메뉴 하나, 끝에 숫자를 쓰면 가격으로 저장돼요 (예: <span className="text-gray-500">순살돈가스 4,500</span>)
        </p>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={f.slot}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-gray-600">{f.slot}</span>
                <input
                  value={f.time}
                  onChange={(e) => update(i, { time: e.target.value })}
                  placeholder="시간 (예: 11:00~13:30)"
                  className="w-36 border border-gray-200 rounded-md px-2 py-1 text-[11px]"
                />
              </div>
              <textarea
                rows={3}
                value={f.text}
                onChange={(e) => update(i, { text: e.target.value })}
                placeholder={f.slot === "중식" ? "흰밥\n순살돈가스 4,500\n미역국" : ""}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] resize-y focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-4">
          <button
            onClick={() => {
              onSave([]);
              onClose();
            }}
            className="text-[12px] text-red-500 font-medium"
          >
            이 날 식단 비우기
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
            <button onClick={save} className="text-[13px] bg-green-600 text-white rounded-lg px-4 py-1.5 font-medium">임시저장</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==================== 월력형 식단표 ==================== */

export const MealCalendar: React.FC<Props> = ({
  shop,
  shops,
  onShopChange,
  published,
  publishedShops,
  drafts,
  draftShopNames,
  onDraftsChange,
  onDraftShopNamesChange,
  onPublished,
  onClose,
}) => {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [token, setToken] = useState(() => tokenStore.load());
  const [showPublish, setShowPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const today = dateKey(new Date());
  const cells = useMemo(() => monthCells(cursor.year, cursor.month), [cursor]);
  const merged = useMemo(() => mergeTables(published, drafts), [published, drafts]);
  const draftCount = countDrafts(drafts);
  const shopName = shops.find((r) => r.code === shop)?.name ?? String(shop);

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const saveDay = useCallback(
    (day: string, sections: MealSection[]) => {
      // 게시본에 없던 날을 비우는 건 초안 자체를 지우는 것과 같다.
      if (sections.length === 0 && !published[day]?.[shop]) {
        const next = { ...drafts, [day]: { ...(drafts[day] ?? {}) } };
        delete next[day][shop];
        if (Object.keys(next[day]).length === 0) delete next[day];
        draftStore.save(next);
        onDraftsChange(next);
      } else {
        onDraftsChange(draftStore.set(drafts, day, shop, sections));
      }
    },
    [drafts, published, shop, onDraftsChange]
  );

  // 가져온 식단(한 식당 또는 북마클릿으로 모은 여러 식당)을 한 번에 임시저장한다(같은 날짜·식당은 덮어씀).
  const applyImport = useCallback(
    (entries: ImportEntry[], names: ShopNames) => {
      const next: MealTable = { ...drafts };
      let dayCount = 0;
      for (const { shop: code, days } of entries) {
        for (const [day, sections] of Object.entries(days)) {
          next[day] = { ...(next[day] ?? {}), [code]: sections };
          dayCount++;
        }
      }
      draftStore.save(next);
      onDraftsChange(next);
      if (Object.keys(names).length > 0) onDraftShopNamesChange(shopNameStore.add(names));
      const first = entries.flatMap((e) => Object.keys(e.days)).sort()[0];
      if (first) {
        const [y, m] = first.split("-").map(Number);
        setCursor({ year: y, month: m - 1 });
      }
      if (entries.length === 1 && entries[0].shop !== shop) onShopChange(entries[0].shop);
      setMessage({
        ok: true,
        text:
          entries.length > 1
            ? `식당 ${entries.length}곳, 총 ${dayCount}일치 식단을 임시저장했어요. 확인 후 "게시하기"를 눌러 주세요.`
            : `${dayCount}일치 식단을 임시저장했어요. 확인 후 "게시하기"를 눌러 주세요.`,
      });
    },
    [drafts, shop, onDraftsChange, onDraftShopNamesChange, onShopChange]
  );

  const publish = async () => {
    if (draftCount === 0 || (!sharedMeals && !token.trim())) return;
    setBusy(true);
    setMessage(null);
    if (!sharedMeals) tokenStore.save(token.trim());
    try {
      const result = sharedMeals
        ? await publishShared(drafts, draftShopNames)
        : await publishDrafts(token.trim(), drafts, draftShopNames);
      draftStore.save({});
      onDraftsChange({});
      shopNameStore.clear();
      onDraftShopNamesChange({});
      onPublished(result.days, result.shops);
      setMessage({ ok: true, text: sharedMeals ? "게시 완료! 모두에게 바로 보입니다." : "게시 완료! 1~2분 뒤 사이트에 반영됩니다." });
      setShowPublish(false);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "게시에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([exportJson(merged, { ...publishedShops, ...draftShopNames })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meal_manual.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-4xl max-h-[92vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button onClick={() => move(-1)} aria-label="이전 달" className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50">‹</button>
            <h4 className="text-base font-bold text-gray-900 w-28 text-center">
              {cursor.year}년 {cursor.month + 1}월
            </h4>
            <button onClick={() => move(1)} aria-label="다음 달" className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50">›</button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {shops.map((r) => (
              <button
                key={r.code}
                onClick={() => onShopChange(r.code)}
                className={`text-[11px] rounded-full px-2.5 py-1 border font-medium ${
                  shop === r.code ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
          <button onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-[11px] text-gray-400">
            생협 페이지를 붙여넣으면 일주일치가 자동으로 채워져요. 날짜를 눌러 직접 고칠 수도 있어요. 임시저장 후 "게시" 해야 모두에게 보여요.
          </p>
          <button
            onClick={() => setImporting(true)}
            className="shrink-0 text-[12px] font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5"
          >
            ⤓ 생협 페이지 붙여넣기
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`text-[11px] font-semibold text-center ${i >= 5 ? "text-gray-300" : "text-gray-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="min-h-[84px]" />;
            const key = dateKey(d);
            const sections = merged[key]?.[shop] ?? [];
            const isDraft = drafts[key]?.[shop] !== undefined;
            const lunch = sections.find((s) => s.meal === "중식") ?? sections[0];
            const weekend = i % 7 >= 5;
            return (
              <button
                key={key}
                onClick={() => setEditing(key)}
                className={`min-h-[84px] rounded-lg border p-1.5 text-left align-top hover:border-green-400 hover:bg-green-50/40 ${
                  key === today ? "border-green-500 ring-1 ring-green-300" : "border-gray-100"
                } ${weekend ? "bg-gray-50/60" : "bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-semibold ${weekend ? "text-gray-300" : "text-gray-600"}`}>{d.getDate()}</span>
                  {isDraft && <span className="text-[8px] font-bold text-amber-600 bg-amber-50 rounded px-1">임시</span>}
                </div>
                {lunch && (
                  <div className="mt-0.5">
                    <p className="text-[9px] text-gray-400">{lunch.meal}</p>
                    {lunch.items.slice(0, 2).map((it, j) => (
                      <p key={j} className="text-[10px] text-gray-700 truncate leading-tight">{it.name}</p>
                    ))}
                    {(lunch.items.length > 2 || sections.length > 1) && (
                      <p className="text-[9px] text-gray-300">
                        {lunch.items.length > 2 ? `+${lunch.items.length - 2}` : ""}
                        {sections.length > 1 ? ` · ${sections.map((s) => s.meal).join("/")}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <footer className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-gray-500">
              {draftCount > 0 ? <>게시 안 된 임시저장 <b className="text-amber-600">{draftCount}건</b></> : "게시 안 된 변경 없음"}
            </p>
            <div className="flex gap-2">
              <button onClick={download} className="text-[12px] text-gray-600 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                JSON 내보내기
              </button>
              <button
                onClick={() => (sharedMeals ? publish() : setShowPublish(!showPublish))}
                disabled={draftCount === 0 || busy}
                className="text-[12px] bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-3 py-1.5 font-medium"
              >
                {busy ? "게시 중…" : sharedMeals && draftCount > 0 ? `${draftCount}건 게시하기` : "게시하기"}
              </button>
            </div>
          </div>

          {!sharedMeals && showPublish && (
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-[11px] text-gray-500 mb-2">
                관리자 전용 — 이 저장소의 <b>Contents: Read and write</b> 권한만 준 GitHub Fine-grained 토큰을 입력하세요.
                토큰은 이 브라우저에만 저장됩니다.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="github_pat_..."
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] bg-white"
                />
                <button
                  onClick={publish}
                  disabled={busy || !token.trim()}
                  className="text-[12px] bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-3 py-1.5 font-medium"
                >
                  {busy ? "게시 중…" : `${draftCount}건 게시`}
                </button>
              </div>
            </div>
          )}
          {message && <p className={`text-[11px] mt-2 ${message.ok ? "text-green-600" : "text-red-500"}`}>{message.text}</p>}
        </footer>
      </div>

      {importing && (
        <MealImportDialog shop={shop} shops={shops} onShopChange={onShopChange} onApply={applyImport} onClose={() => setImporting(false)} />
      )}
      {editing && (
        <DayEditor
          key={`${editing}-${shop}`}
          day={editing}
          shopName={shopName}
          initial={merged[editing]?.[shop] ?? []}
          onSave={(sections) => saveDay(editing, sections)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default MealCalendar;
