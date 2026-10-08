import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { staticData, type MealPayload, type MealSection } from "../lib/staticData";
import { knownShops, myShopsStore, shopNameStore, type ShopNames } from "../lib/shops";
import { dateKey, draftStore, fetchPublished, mergeTables, type MealTable } from "../lib/mealManual";
import MealCalendar from "./MealCalendar";

const MAX_ITEMS = 5;
const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function won(price: number | null): string {
  return price == null ? "" : price.toLocaleString("ko-KR") + "원";
}

// 수집 시각(scraped_at)이 오늘(브라우저 로컬 날짜)이 아니면 지난 식단이다.
function isStale(scrapedAt: string): boolean {
  return scrapedAt.slice(0, 10) !== dateKey(new Date());
}

const MealSections: React.FC<{ sections: MealSection[] }> = ({ sections }) => (
  <div className="space-y-3">
    {sections.map((section) => (
      <div key={section.meal}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-bold text-gray-500">{section.meal}</span>
          {section.items[0]?.time && <span className="text-[10px] text-gray-300">{section.items[0].time}</span>}
        </div>
        <ul className="space-y-1">
          {section.items.slice(0, MAX_ITEMS).map((item, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2">
              <span className="flex-1 min-w-0 truncate text-[12px] text-gray-700">{item.name}</span>
              <span className="shrink-0 text-[11px] text-gray-400 tabular-nums">{won(item.price)}</span>
            </li>
          ))}
          {section.items.length > MAX_ITEMS && (
            <li className="text-[10px] text-gray-300">외 {section.items.length - MAX_ITEMS}개 메뉴</li>
          )}
        </ul>
      </div>
    ))}
  </div>
);

export const MealWidget: React.FC = () => {
  const [cache, setCache] = useState<Record<number, MealPayload | null>>({});
  const [published, setPublished] = useState<MealTable>({});
  const [publishedShops, setPublishedShops] = useState<ShopNames>({});
  const [drafts, setDrafts] = useState<MealTable>(() => draftStore.load());
  const [draftShopNames, setDraftShopNames] = useState<ShopNames>(() => shopNameStore.load());
  const [mine, setMine] = useState<number[]>(() => myShopsStore.load());
  const [shop, setShop] = useState<number>(() => myShopsStore.load()[0] ?? 35);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // 기본 3곳 + 게시본·이 브라우저에서 발견한 식당. 위젯 탭에는 "내 식당"만 보인다.
  const shops = useMemo(() => knownShops(publishedShops, draftShopNames), [publishedShops, draftShopNames]);
  const tabs = useMemo(() => {
    const picked = shops.filter((s) => mine.includes(s.code));
    return picked.length > 0 ? picked : shops.slice(0, 3);
  }, [shops, mine]);

  const toggleMine = (code: number) => {
    const next = mine.includes(code) ? mine.filter((c) => c !== code) : [...mine, code];
    myShopsStore.save(next);
    setMine(next);
    if (!next.includes(shop) && next.length > 0) setShop(next[0]);
  };

  const data = shop in cache ? cache[shop] : undefined;

  useEffect(() => {
    if (shop in cache) return;
    let alive = true;
    staticData.meal(shop).then((d) => {
      if (alive) setCache((prev) => ({ ...prev, [shop]: d }));
    });
    return () => {
      alive = false;
    };
  }, [shop, cache]);

  useEffect(() => {
    let alive = true;
    fetchPublished().then((f) => {
      if (!alive) return;
      setPublished(f.days);
      setPublishedShops(f.shops);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 사람이 직접 올린 오늘 식단(임시저장 포함)이 있으면 자동 수집본보다 우선한다.
  const manual = useMemo(() => {
    const sections = mergeTables(published, drafts)[dateKey(new Date())]?.[shop];
    return sections && sections.length > 0 ? sections : null;
  }, [published, drafts, shop]);
  const manualIsDraft = drafts[dateKey(new Date())]?.[shop] !== undefined;

  const scrapedOk = !manual && data && data.status !== "unavailable" && data.meals.length > 0;
  const dayLabel = manual ? WEEKDAY_NAMES[new Date().getDay()] : data?.status !== "unavailable" ? data?.day : null;

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-600" />
          <h3 className="text-sm font-semibold text-gray-800">오늘의 학식</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {dayLabel && (
            <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded-full px-2.5 py-1">{dayLabel}요일</span>
          )}
          <button
            onClick={() => setShowPicker(!showPicker)}
            aria-label="내 식당 고르기"
            title="내 식당 고르기"
            className={`w-6 h-6 rounded-full border text-[11px] leading-none grid place-items-center ${
              showPicker ? "border-green-400 text-green-600" : "border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-300"
            }`}
          >
            ⚙
          </button>
          <button
            onClick={() => setShowCalendar(true)}
            aria-label="월간 식단표"
            title="월간 식단표 · 직접 입력"
            className="w-6 h-6 rounded-full border border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-300 text-[11px] leading-none grid place-items-center"
          >
            ▦
          </button>
        </div>
      </header>

      {showPicker && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-[10px] text-gray-500 mb-1.5">위젯에 보일 식당을 고르세요 ({shops.length}곳 중)</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {shops.map((s) => (
              <label key={s.code} className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={mine.includes(s.code)} onChange={() => toggleMine(s.code)} className="accent-green-600" />
                {s.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {tabs.map((r) => (
          <button
            key={r.code}
            onClick={() => setShop(r.code)}
            className={`text-[11px] rounded-full px-2.5 py-1 border font-medium ${
              shop === r.code ? "bg-green-600 border-green-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {manual && (
        <>
          <p className="text-[10px] text-gray-400 mb-2">
            {manualIsDraft ? "✎ 직접 입력 (임시저장 · 아직 게시 전)" : "✎ 직접 등록된 식단"}
          </p>
          <MealSections sections={manual} />
        </>
      )}

      {!manual && data === undefined && <p className="text-[12px] text-gray-400 py-6 text-center">불러오는 중…</p>}
      {!manual && data?.status === "unavailable" && (
        <div className="py-5 text-center">
          <p className="text-[12px] text-gray-500">학식 정보를 가져오지 못했어요.</p>
          <p className="text-[10px] text-gray-400 mt-1">생협 사이트가 수집 서버 접속을 막고 있어 복구 중입니다.</p>
          <div className="flex justify-center gap-3 mt-2">
            <a
              href={`https://coop.knu.ac.kr/sub03/sub01_01.html?shop_sqno=${shop}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium text-green-600 hover:underline"
            >
              생협 식단 페이지 ↗
            </a>
            <button onClick={() => setShowCalendar(true)} className="text-[11px] font-medium text-gray-500 hover:underline">
              식단 직접 입력
            </button>
          </div>
        </div>
      )}
      {!manual && data?.status !== "unavailable" && (data === null || (data && data.meals.length === 0)) && (
        <p className="text-[12px] text-gray-400 py-6 text-center">이 식당의 식단 정보가 없습니다.</p>
      )}

      {scrapedOk && isStale(data.scraped_at) && (
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded-md px-2 py-1 mb-2">
          {data.scraped_at.slice(5, 10).replace("-", "/")} 기준 식단이에요 — 오늘 식단은 아직 수집되지 않았어요.
        </p>
      )}
      {scrapedOk && <MealSections sections={data.meals} />}

      {/* 그리드 아이템의 CSS transform 안에서는 fixed 모달이 갇히므로 body 로 포털 */}
      {showCalendar && createPortal(
        <MealCalendar
          shop={shop}
          shops={shops}
          onShopChange={setShop}
          published={published}
          publishedShops={publishedShops}
          drafts={drafts}
          draftShopNames={draftShopNames}
          onDraftsChange={setDrafts}
          onDraftShopNamesChange={setDraftShopNames}
          onPublished={(days, names) => {
            setPublished(days);
            setPublishedShops(names);
          }}
          onClose={() => setShowCalendar(false)}
        />,
        document.body
      )}
    </section>
  );
};

export default MealWidget;
