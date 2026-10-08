import React, { useCallback, useState } from "react";
import type { MealSection } from "../lib/staticData";
import type { Shop, ShopNames } from "../lib/shops";
import { BOOKMARKLET_HREF } from "../lib/bookmarklet";
import {
  DAY_NAMES,
  parseBundle,
  parseCoopPage,
  thisMonday,
  tryParseBundle,
  type ImportedShop,
  type ImportedWeek,
} from "../lib/mealImport";

export interface ImportEntry {
  shop: number;
  days: Record<string, MealSection[]>;
}

interface Props {
  shop: number;
  shops: Shop[];
  onShopChange: (shop: number) => void;
  onApply: (entries: ImportEntry[], names: ShopNames) => void;
  onClose: () => void;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/* ==================== 미리보기 ==================== */

const WeekPreview: React.FC<{ week: ImportedWeek }> = ({ week }) => (
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
    {week.dates.map((d, i) => {
      const sections = week.days[d] ?? [];
      return (
        <div key={d} className="rounded-lg border border-gray-100 p-2 min-h-[64px]">
          <p className="text-[10px] font-semibold text-gray-500">
            {DAY_NAMES[i]} {d.slice(5).replace("-", "/")}
          </p>
          {sections.length === 0 && <p className="text-[10px] text-gray-300 mt-1">없음</p>}
          {sections.map((s) => (
            <p key={s.meal} className="text-[10px] text-gray-700 truncate mt-0.5">
              <span className="text-gray-400">{s.meal}</span> {s.items[0]?.name}
              {s.items.length > 1 && <span className="text-gray-300"> +{s.items.length - 1}</span>}
            </p>
          ))}
        </div>
      );
    })}
  </div>
);

/* ==================== 가져오기 창 ==================== */

// 생협 식단을 가져온다.
//  1) 북마클릿: 생협 사이트에서 한 번 누르면 모든 식당을 모아 복사 → 여기 붙여넣기 (추천)
//  2) 식당 한 곳 페이지를 통째로 복사해 붙여넣기
export const MealImportDialog: React.FC<Props> = ({ shop, shops, onShopChange, onApply, onClose }) => {
  const [raw, setRaw] = useState<string | null>(null);
  const [monday, setMonday] = useState(() => thisMonday());
  const [single, setSingle] = useState<ImportedWeek | null>(null);
  const [bundle, setBundle] = useState<ImportedShop[] | null>(null);
  const [error, setError] = useState("");

  const run = useCallback(
    (text: string, mon: Date) => {
      setError("");
      setSingle(null);
      setBundle(null);

      const b = tryParseBundle(text);
      if (b) {
        const parsed = parseBundle(b, mon).filter((s) => Object.keys(s.week.days).length > 0);
        if (parsed.length === 0) setError(`식당 ${b.shops.length}곳을 받았지만 식단을 하나도 읽지 못했어요. 생협 페이지 구조가 바뀌었을 수 있어요.`);
        else setBundle(parsed);
        return;
      }

      const r = parseCoopPage(text, mon);
      if (r.tableCount > 0) {
        setSingle(r);
        return;
      }
      if (r.diag.allTables === 0 && !/<[a-z][\s\S]*>/i.test(text)) {
        setError("표 구조 없이 글자만 복사됐어요. 생협 페이지에서 Ctrl+U(페이지 소스) → Ctrl+A → Ctrl+C 로 다시 복사해 주세요.");
      } else {
        setError(
          `식단표(중식·석식 표)를 찾지 못했어요. 받은 표 ${r.diag.allTables}개` +
            (r.diag.heads.length ? `: ${r.diag.heads.map((h) => `"${h}"`).join(", ")}` : "") +
            " — 생협 페이지 구조가 바뀌었을 수 있어요."
        );
      }
    },
    []
  );

  const accept = useCallback(
    (text: string) => {
      setRaw(text);
      run(text, monday);
    },
    [monday, run]
  );

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const plain = e.clipboardData.getData("text/plain");
    // 북마클릿 묶음은 text/plain(JSON). 화면 복사는 text/html 에 표 구조가 있다. 소스 복사는 text/plain 이 곧 HTML.
    const text = tryParseBundle(plain) ? plain : e.clipboardData.getData("text/html") || plain;
    if (text.trim()) accept(text);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
    accept(text);
  };

  // 해석에 실패한 내용을 파일로 저장 → 파서 수정에 사용
  const saveRaw = () => {
    if (!raw) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "text/html" }));
    a.download = "coop_meal_pasted.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const apply = () => {
    if (bundle) {
      onApply(
        bundle.map((s) => ({ shop: s.code, days: s.week.days })),
        Object.fromEntries(bundle.map((s) => [String(s.code), s.name]))
      );
    } else if (single) {
      onApply([{ shop, days: single.days }], {});
    }
    onClose();
  };

  const totalDays = bundle
    ? bundle.reduce((n, s) => n + Object.keys(s.week.days).length, 0)
    : single
      ? Object.keys(single.days).length
      : 0;
  const shopName = shops.find((r) => r.code === shop)?.name ?? "";

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800 mb-3">생협 식단표 가져오기</h4>

        {/* ---- 방법 1: 북마클릿 ---- */}
        <section className="rounded-lg border border-green-200 bg-green-50/50 p-3 mb-3">
          <p className="text-[12px] font-bold text-green-700 mb-1">★ 모든 식당 한 번에 (추천 · 주 1회)</p>
          <ol className="text-[11px] text-gray-600 space-y-1 list-decimal list-inside">
            <li>
              이 버튼을 <b>즐겨찾기(북마크) 막대로 끌어다 놓으세요</b> (처음 한 번만):{" "}
              <a
                ref={(el) => el?.setAttribute("href", BOOKMARKLET_HREF)}
                onClick={(e) => {
                  e.preventDefault();
                  alert("이 버튼은 클릭이 아니라 즐겨찾기 막대로 끌어다 놓는 버튼이에요. 그 다음 생협 페이지에서 눌러 주세요.");
                }}
                className="inline-block align-middle text-[11px] font-bold text-white bg-green-600 rounded-md px-2 py-0.5 cursor-grab"
                title="즐겨찾기 막대로 드래그"
              >
                📋 생협 식단 모으기
              </a>
              <span className="text-gray-400"> (막대가 안 보이면 Ctrl+Shift+B)</span>
            </li>
            <li>
              <a href="https://coop.knu.ac.kr/sub03/sub01_01.html?shop_sqno=35" target="_blank" rel="noreferrer" className="text-green-700 font-medium hover:underline">
                생협 식단 페이지 ↗
              </a>
              에서 즐겨찾기의 <b>📋 생협 식단 모으기</b>를 누르면 모든 식당 식단이 복사돼요
            </li>
            <li>아래 상자를 누르고 <b>Ctrl+V</b></li>
          </ol>
        </section>

        {/* ---- 방법 2: 한 식당 페이지 붙여넣기 ---- */}
        <details className="mb-3">
          <summary className="text-[11px] text-gray-500 cursor-pointer">또는 식당 한 곳만 — 페이지 전체 복사해서 붙여넣기</summary>
          <div className="mt-2 pl-3">
            <div className="flex gap-1.5 mb-1.5 flex-wrap">
              {shops.map((r) => (
                <button
                  key={r.code}
                  onClick={() => {
                    onShopChange(r.code);
                    setRaw(null);
                    setSingle(null);
                    setBundle(null);
                    setError("");
                  }}
                  className={`text-[11px] rounded-full px-2.5 py-1 border font-medium ${
                    shop === r.code ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              <a
                href={`https://coop.knu.ac.kr/sub03/sub01_01.html?shop_sqno=${shop}`}
                target="_blank"
                rel="noreferrer"
                className="text-green-600 font-medium hover:underline"
              >
                {shopName} 페이지 열기 ↗
              </a>{" "}
              → <b>Ctrl+A</b> → <b>Ctrl+C</b> → 아래 상자에 <b>Ctrl+V</b>
            </p>
          </div>
        </details>

        {/* 편집 가능한 textarea 여야 Safari·모바일에서도 붙여넣기(길게 눌러 붙여넣기 포함)가 동작한다 */}
        <textarea
          rows={3}
          value=""
          onPaste={onPaste}
          onChange={(e) => {
            // onPaste 를 거치지 않은 입력(일부 모바일 키보드) 대비
            if (e.target.value.trim()) accept(e.target.value);
          }}
          placeholder={raw ? "✓ 붙여넣음 — 다른 내용을 다시 붙여넣어도 돼요" : "여기를 누르고 Ctrl+V (모바일은 길게 눌러 붙여넣기)"}
          className="w-full rounded-lg border-2 border-dashed border-gray-300 focus:border-green-500 focus:outline-none bg-gray-50 text-center text-[13px] py-5 px-3 resize-none placeholder:text-gray-500"
        />
        <p className="text-[10px] text-gray-400 mt-1 text-center">
          페이지 소스(Ctrl+U)를 복사해도 되고,{" "}
          <label className="text-green-600 underline cursor-pointer">
            저장한 .html 파일 선택
            <input type="file" accept=".html,.htm,text/html" onChange={onFile} className="hidden" />
          </label>
          도 돼요
        </p>

        {error && (
          <div className="mt-2">
            <p className="text-[11px] text-red-500">{error}</p>
            {raw && (
              <button onClick={saveRaw} className="text-[11px] text-gray-500 underline mt-1">
                붙여넣은 내용 파일로 저장 (개발자에게 보내 주시면 맞춰 드려요)
              </button>
            )}
          </div>
        )}

        {bundle && (
          <div className="mt-3 space-y-3">
            <p className="text-[12px] text-gray-600">
              식당 <b className="text-green-600">{bundle.length}곳</b> · {bundle[0].week.dates[0]} 주 식단을 찾았어요
            </p>
            {bundle.map((s) => (
              <div key={s.code}>
                <p className="text-[11px] font-bold text-gray-700 mb-1">
                  {s.name} <span className="font-normal text-gray-400">· {Object.keys(s.week.days).length}일치</span>
                </p>
                <WeekPreview week={s.week} />
              </div>
            ))}
          </div>
        )}

        {single && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] text-gray-600">
                {shopName} · {single.dates[0]} 주 · <b className="text-green-600">{totalDays}일치</b> 식단을 찾았어요
                {single.dateSource === "page" ? " (날짜는 페이지에서 읽음)" : ""}
              </p>
              {single.dateSource === "chosen" && (
                <label className="text-[11px] text-amber-600 flex items-center gap-1">
                  페이지에 날짜가 없어요 — 주 시작(월):
                  <input
                    type="date"
                    value={single.dates[0]}
                    onChange={(e) => {
                      if (!e.target.value || !raw) return;
                      const d = parseLocalDate(e.target.value);
                      setMonday(d);
                      run(raw, d);
                    }}
                    className="border border-amber-300 rounded px-1 py-0.5 text-[11px]"
                  />
                </label>
              )}
            </div>
            <WeekPreview week={single} />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
          <button
            onClick={apply}
            disabled={totalDays === 0}
            className="text-[13px] bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
          >
            {bundle ? `식당 ${bundle.length}곳 임시저장` : totalDays > 0 ? `${totalDays}일치 임시저장` : "임시저장"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MealImportDialog;
