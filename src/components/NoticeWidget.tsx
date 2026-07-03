import React, { useEffect, useState } from "react";
import { staticData, type NoticesPayload } from "../lib/staticData";

const MAX_ROWS = 6;

export const NoticeWidget: React.FC = () => {
  const [data, setData] = useState<NoticesPayload | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    staticData.notices().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <h3 className="text-sm font-semibold text-gray-800">학교 공지사항</h3>
        </div>
        {data?.scraped_at && (
          <span className="text-[10px] text-gray-400">
            {data.scraped_at.slice(0, 10)} 수집
          </span>
        )}
      </header>

      {data === undefined && <p className="text-[12px] text-gray-400 py-6 text-center">불러오는 중…</p>}
      {data === null && <p className="text-[12px] text-gray-400 py-6 text-center">공지 데이터를 불러오지 못했습니다.</p>}

      {data && (
        <ul className="divide-y divide-gray-50">
          {data.notices.slice(0, MAX_ROWS).map((n) => (
            <li key={n.url}>
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 py-2 group"
              >
                {n.pinned && (
                  <span className="shrink-0 text-[9px] font-bold text-red-500 bg-red-50 rounded px-1.5 py-0.5">공지</span>
                )}
                <span className="flex-1 min-w-0 truncate text-[13px] text-gray-800 group-hover:text-indigo-600 group-hover:underline">
                  {n.title}
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">{n.author}</span>
                <span className="shrink-0 text-[11px] text-gray-300 tabular-nums">{n.date.slice(5)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NoticeWidget;
