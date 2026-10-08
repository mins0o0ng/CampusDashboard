import React, { useEffect, useState } from "react";
import { staticData, RESTAURANTS, type MealPayload } from "../lib/staticData";

const MAX_ITEMS = 5;

function won(price: number | null): string {
  return price == null ? "" : price.toLocaleString("ko-KR") + "원";
}

// 수집 시각(scraped_at)이 오늘(브라우저 로컬 날짜)이 아니면 지난 식단이다.
function isStale(scrapedAt: string): boolean {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return scrapedAt.slice(0, 10) !== today;
}

export const MealWidget: React.FC = () => {
  const [shop, setShop] = useState<number>(RESTAURANTS[0].code);
  const [cache, setCache] = useState<Record<number, MealPayload | null>>({});

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

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-600" />
          <h3 className="text-sm font-semibold text-gray-800">오늘의 학식</h3>
        </div>
        {data?.day && data.status !== "unavailable" && (
          <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded-full px-2.5 py-1">{data.day}요일</span>
        )}
      </header>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {RESTAURANTS.map((r) => (
          <button
            key={r.code}
            onClick={() => setShop(r.code)}
            className={`text-[11px] rounded-full px-2.5 py-1 border font-medium ${
              shop === r.code
                ? "bg-green-600 border-green-600 text-white"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {data === undefined && <p className="text-[12px] text-gray-400 py-6 text-center">불러오는 중…</p>}
      {data?.status === "unavailable" && (
        <div className="py-5 text-center">
          <p className="text-[12px] text-gray-500">학식 정보를 가져오지 못했어요.</p>
          <p className="text-[10px] text-gray-400 mt-1">생협 사이트가 수집 서버 접속을 막고 있어 복구 중입니다.</p>
          <a
            href={`https://coop.knu.ac.kr/sub03/sub01_01.html?shop_sqno=${shop}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-2 text-[11px] font-medium text-green-600 hover:underline"
          >
            생협 식단 페이지에서 보기 ↗
          </a>
        </div>
      )}
      {data?.status !== "unavailable" && (data === null || (data && data.meals.length === 0)) && (
        <p className="text-[12px] text-gray-400 py-6 text-center">이 식당의 식단 정보가 없습니다.</p>
      )}

      {data && data.status !== "unavailable" && data.meals.length > 0 && isStale(data.scraped_at) && (
        <p className="text-[10px] text-amber-600 bg-amber-50 rounded-md px-2 py-1 mb-2">
          {data.scraped_at.slice(5, 10).replace("-", "/")} 기준 식단이에요 — 오늘 식단은 아직 수집되지 않았어요.
        </p>
      )}

      {data && data.status !== "unavailable" && data.meals.length > 0 && (
        <div className="space-y-3">
          {data.meals.map((section) => (
            <div key={section.meal}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-gray-500">{section.meal}</span>
                {section.items[0]?.time && (
                  <span className="text-[10px] text-gray-300">{section.items[0].time}</span>
                )}
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
      )}
    </section>
  );
};

export default MealWidget;
