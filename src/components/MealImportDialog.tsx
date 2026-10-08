import React, { useCallback, useState } from "react";
import { RESTAURANTS, type MealSection } from "../lib/staticData";
import { DAY_NAMES, parseCoopPage, thisMonday, type ImportedWeek } from "../lib/mealImport";

interface Props {
  shop: number;
  onShopChange: (shop: number) => void;
  onApply: (days: Record<string, MealSection[]>) => void;
  onClose: () => void;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// 생협 식단 페이지를 통째로 붙여넣어 그 주 식단을 한 번에 채운다.
export const MealImportDialog: React.FC<Props> = ({ shop, onShopChange, onApply, onClose }) => {
  const [raw, setRaw] = useState<string | null>(null);
  const [monday, setMonday] = useState(() => thisMonday());
  const [result, setResult] = useState<ImportedWeek | null>(null);
  const [error, setError] = useState("");

  const run = useCallback((html: string, mon: Date) => {
    const r = parseCoopPage(html, mon);
    if (r.tableCount === 0) {
      setResult(null);
      if (r.diag.allTables === 0 && !/<[a-z][\s\S]*>/i.test(html)) {
        setError("표 구조 없이 글자만 복사됐어요. 생협 페이지에서 Ctrl+U(페이지 소스) → Ctrl+A → Ctrl+C 로 다시 복사해 주세요.");
      } else {
        setError(
          `식단표(중식·석식 표)를 찾지 못했어요. 받은 표 ${r.diag.allTables}개` +
            (r.diag.heads.length ? `: ${r.diag.heads.map((h) => `"${h}"`).join(", ")}` : "") +
            " — 생협 페이지 구조가 바뀌었을 수 있어요."
        );
      }
      return;
    }
    setError("");
    setResult(r);
  }, []);

  // 해석에 실패한 내용을 파일로 저장 → 파서 수정에 사용
  const saveRaw = () => {
    if (!raw) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "text/html" }));
    a.download = "coop_meal_pasted.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const accept = useCallback(
    (html: string) => {
      setRaw(html);
      run(html, monday);
    },
    [monday, run]
  );

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    // 화면 복사(Ctrl+A, Ctrl+C)는 text/html 에 표 구조가 그대로 들어 있다. 소스 복사는 text/plain 이 곧 HTML.
    const html = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain");
    if (!html.trim()) return;
    accept(html);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    // 생협 페이지는 UTF-8 이지만, 다른 인코딩으로 저장된 파일도 받아 준다.
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("euc-kr").decode(buf);
    accept(text);
  };

  const dayCount = result ? Object.keys(result.days).length : 0;
  const shopName = RESTAURANTS.find((r) => r.code === shop)?.name ?? "";

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800 mb-1">생협 식단표 한 번에 가져오기</h4>
        <ol className="text-[11px] text-gray-500 mb-3 space-y-0.5 list-decimal list-inside">
          <li>
            <a
              href={`https://coop.knu.ac.kr/sub03/sub01_01.html?shop_sqno=${shop}`}
              target="_blank"
              rel="noreferrer"
              className="text-green-600 font-medium hover:underline"
            >
              {shopName} 식단 페이지 열기 ↗
            </a>
          </li>
          <li>그 페이지에서 <b>Ctrl+A</b> → <b>Ctrl+C</b> (전체 복사)</li>
          <li>아래 상자를 누르고 <b>Ctrl+V</b> — 식단 부분만 골라 일주일치를 채워요</li>
        </ol>

        <div className="flex gap-1.5 mb-2 flex-wrap">
          {RESTAURANTS.map((r) => (
            <button
              key={r.code}
              onClick={() => {
                onShopChange(r.code);
                setRaw(null);
                setResult(null);
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

        {result && (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] text-gray-600">
                {result.dates[0]} 주 · <b className="text-green-600">{dayCount}일치</b> 식단을 찾았어요
                {result.dateSource === "page" ? " (날짜는 페이지에서 읽음)" : ""}
              </p>
              {result.dateSource === "chosen" && (
                <label className="text-[11px] text-amber-600 flex items-center gap-1">
                  페이지에 날짜가 없어요 — 주 시작(월):
                  <input
                    type="date"
                    value={result.dates[0]}
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
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {result.dates.map((d, i) => {
                const sections = result.days[d] ?? [];
                return (
                  <div key={d} className="rounded-lg border border-gray-100 p-2 min-h-[72px]">
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
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
          <button
            onClick={() => {
              if (!result) return;
              onApply(result.days);
              onClose();
            }}
            disabled={dayCount === 0}
            className="text-[13px] bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
          >
            {dayCount > 0 ? `${dayCount}일치 임시저장` : "임시저장"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MealImportDialog;
