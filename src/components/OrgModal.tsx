import React, { useCallback, useState } from "react";
import type { Org, WidgetColor } from "../types";

const COLORS: { key: WidgetColor; dot: string }[] = [
  { key: "indigo", dot: "bg-indigo-600" },
  { key: "red", dot: "bg-red-500" },
  { key: "green", dot: "bg-green-600" },
  { key: "amber", dot: "bg-amber-500" },
];

interface Props {
  org: Org | null; // null 이면 새 소속 추가
  onSave: (name: string, color: WidgetColor) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const OrgModal: React.FC<Props> = ({ org, onSave, onDelete, onClose }) => {
  const [name, setName] = useState(org?.name ?? "");
  const [color, setColor] = useState<WidgetColor>(org?.color ?? "indigo");

  const save = useCallback(() => {
    if (!name.trim()) return;
    onSave(name.trim(), color);
    onClose();
  }, [name, color, onSave, onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-72 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800 mb-3">{org ? "소속 수정" : "소속 추가"}</h4>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="소속 이름 (예: 밴드 동아리)"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <div className="flex gap-2 mb-4">
          {COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => setColor(c.key)}
              aria-label={`${c.key} 색`}
              className={`w-7 h-7 rounded-full ${c.dot} ${color === c.key ? "ring-2 ring-offset-2 ring-gray-400" : "opacity-60"}`}
            />
          ))}
        </div>
        <div className="flex justify-between">
          {org && onDelete ? (
            <button onClick={() => { onDelete(); onClose(); }} className="text-[13px] text-red-500 font-medium">삭제</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
            <button onClick={save} className="text-[13px] bg-indigo-600 text-white rounded-lg px-4 py-1.5 font-medium">저장</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgModal;
