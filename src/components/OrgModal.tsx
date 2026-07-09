import React, { useCallback, useState } from "react";
import type { Org } from "../types";

// PPT 표준 색상표 스타일: 8가지 색상 계열 × 5단계 명도
const PALETTE: string[][] = [
  ["#7F1D1D", "#B91C1C", "#EF4444", "#F87171", "#FECACA"], // 빨강
  ["#7C2D12", "#C2410C", "#F97316", "#FB923C", "#FED7AA"], // 주황
  ["#713F12", "#A16207", "#F59E0B", "#FBBF24", "#FDE68A"], // 노랑
  ["#14532D", "#15803D", "#16A34A", "#4ADE80", "#BBF7D0"], // 초록
  ["#134E4A", "#0F766E", "#14B8A6", "#2DD4BF", "#99F6E4"], // 청록
  ["#1E3A8A", "#1D4ED8", "#3B82F6", "#60A5FA", "#BFDBFE"], // 파랑
  ["#312E81", "#4338CA", "#4F46E5", "#818CF8", "#C7D2FE"], // 남보라
  ["#581C87", "#7E22CE", "#A855F7", "#C084FC", "#E9D5FF"], // 보라
];

interface Props {
  org: Org | null; // null 이면 새 소속 추가
  onSave: (name: string, color: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export const OrgModal: React.FC<Props> = ({ org, onSave, onDelete, onClose }) => {
  const [name, setName] = useState(org?.name ?? "");
  const [color, setColor] = useState(org?.color ?? "#4F46E5");

  const save = useCallback(() => {
    if (!name.trim()) return;
    onSave(name.trim(), color);
    onClose();
  }, [name, color, onSave, onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800 mb-3">{org ? "소속 수정" : "소속 추가"}</h4>

        <label className="block mb-3">
          <span className="block text-[11px] font-semibold text-gray-500 mb-1">이름</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && save()}
            placeholder="소속 이름 (예: 밴드 동아리)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </label>

        <span className="block text-[11px] font-semibold text-gray-500 mb-1.5">색상</span>
        <div className="grid grid-cols-8 gap-1 mb-2">
          {/* 팔레트를 세로(계열) → 가로(명도) 순으로 배치: PPT 색상표처럼 행=명도, 열=계열 */}
          {[0, 1, 2, 3, 4].map((shade) =>
            PALETTE.map((family, col) => {
              const c = family[shade];
              return (
                <button
                  key={`${col}-${shade}`}
                  onClick={() => setColor(c)}
                  aria-label={`색상 ${c}`}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded ${color.toUpperCase() === c.toUpperCase() ? "ring-2 ring-offset-1 ring-gray-500" : "hover:scale-110"} transition-transform`}
                />
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 bg-white"
            />
            사용자 지정
          </label>
          <span
            className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-white rounded-full px-2.5 py-1"
            style={{ backgroundColor: color }}
          >
            {name.trim() || "미리보기"}
          </span>
        </div>

        <div className="flex justify-between">
          {org && onDelete ? (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="text-[13px] text-red-500 font-medium hover:bg-red-50 rounded-lg px-3 py-1.5"
            >
              삭제
            </button>
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
