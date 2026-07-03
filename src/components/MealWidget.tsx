import React, { useEffect, useState } from "react";
import { staticData, type MealPayload } from "../lib/staticData";

const MAX_ITEMS = 5;

function won(price: number | null): string {
  return price == null ? "" : price.toLocaleString("ko-KR") + "원";
}

export const MealWidget: React.FC = () => {
  const [data, setData] = useState<MealPayload | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    staticData.meal().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-2xl bg-white border border-gray-200 shadow-sm p-5">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-600" />
          <h3 className="text-sm font-semibold text-gray-800">오늘의 학식</h3>
        </div>
        {data?.day && (
          <span className="text-[10px] font-bold text-green-600 bg-green-50 rounded-full px-2.5 py-1">{data.day}요일</span>
        )}
      </header>

      {data === undefined && <p className="text-[12px] text-gray-400 py-6 text-center">불러오는 중…</p>}
      {(data === null || (data && data.meals.length === 0)) && (
        <p className="text-[12px] text-gray-400 py-6 text-center">오늘은 식단 정보가 없습니다.</p>
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
