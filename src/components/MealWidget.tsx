import React, { useEffect, useState } from "react";
import { staticData, RESTAURANTS, type MealPayload } from "../lib/staticData";

const MAX_ITEMS = 5;

function won(price: number | null): string {
  return price == null ? "" : price.toLocaleString("ko-KR") + "원";
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
        {data?.day && (
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
      {(data === null || (data && data.meals.length === 0)) && (
        <p className="text-[12px] text-gray-400 py-6 text-center">이 식당의 식단 정보가 없습니다.</p>
      )}

      {data && data.meals.length > 0 && (
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
