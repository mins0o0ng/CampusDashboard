import React, { useCallback } from "react";
import type { CustomWidgetSpec, WidgetColor } from "../types";

const DOT: Record<WidgetColor, string> = {
  indigo: "bg-indigo-600",
  red: "bg-red-500",
  green: "bg-green-600",
  amber: "bg-amber-500",
};

interface Props {
  spec: CustomWidgetSpec;
  onChange: (spec: CustomWidgetSpec) => void;
}

function ddayRemain(date: string): number {
  const today = new Date(new Date().toDateString());
  return Math.ceil((new Date(date).getTime() - today.getTime()) / 86_400_000);
}

export const CustomWidget: React.FC<Props> = ({ spec, onChange }) => {
  const toggleItem = useCallback(
    (idx: number) => {
      if (spec.type !== "checklist") return;
      onChange({
        ...spec,
        items: spec.items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)),
      });
    },
    [spec, onChange]
  );

  return (
    <section className="h-full rounded-2xl bg-white border border-gray-200 shadow-sm p-5 overflow-auto">
      <header className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${DOT[spec.color]}`} />
        <h3 className="text-sm font-semibold text-gray-800 truncate">{spec.title}</h3>
        <span className="ml-auto shrink-0 text-[9px] font-bold text-violet-500 bg-violet-50 rounded-full px-2 py-0.5">AI</span>
      </header>

      {spec.type === "note" && (
        <p className="text-[13px] text-gray-700 whitespace-pre-wrap leading-relaxed">{spec.text}</p>
      )}

      {spec.type === "checklist" && (
        <ul className="space-y-1.5">
          {spec.items.map((item, i) => (
            <li key={i}>
              <button onClick={() => toggleItem(i)} className="flex items-center gap-2.5 w-full text-left group">
                <span className={`w-4 h-4 rounded border grid place-items-center text-[10px] ${item.done ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 text-transparent"}`}>✓</span>
                <span className={`text-[13px] ${item.done ? "text-gray-300 line-through" : "text-gray-700"}`}>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {spec.type === "dday" && (() => {
        const remain = ddayRemain(spec.date);
        const text = remain > 0 ? `D-${remain}` : remain === 0 ? "D-Day" : `D+${-remain}`;
        return (
          <div className="text-center py-2">
            <p className="text-3xl font-extrabold text-gray-900">{text}</p>
            <p className="text-[12px] text-gray-500 mt-1.5">{spec.label}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">{spec.date}</p>
          </div>
        );
      })()}

      {spec.type === "links" && (
        <ul className="space-y-1.5">
          {spec.links.map((link, i) => (
            <li key={i}>
              <a href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-indigo-600 hover:underline">
                <span className="text-gray-300">↗</span>
                <span className="truncate">{link.label}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default CustomWidget;
