import React, { useCallback, useState } from "react";
import type { CustomWidgetSpec } from "../types";
import { generateWidget, apiKeyStore } from "../lib/aiWidget";

interface Props {
  onAdd: (spec: CustomWidgetSpec) => void;
  onClose: () => void;
}

export const AddWidgetDialog: React.FC<Props> = ({ onAdd, onClose }) => {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState(() => apiKeyStore.load());
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError("");
    apiKeyStore.save(apiKey.trim());
    try {
      const result = await generateWidget(prompt.trim());
      onAdd(result.spec);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "위젯 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [prompt, apiKey, busy, onAdd, onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 w-[26rem] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-gray-800 mb-1">AI 로 위젯 만들기</h4>
        <p className="text-[11px] text-gray-400 mb-3">
          필요한 위젯을 설명하면 무료 AI 가 만들어 드립니다(키 불필요 · 첫 사용 시 Puter 로그인 창이 뜰 수 있어요).
          메모·체크리스트·D-Day·링크 모음을 지원해요.
        </p>

        <textarea
          autoFocus
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={'예: "기말고사 12월 15일까지 디데이" / "MT 준비물 체크리스트: 침낭, 세면도구, 보드게임"'}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />

        <button onClick={() => setShowKey(!showKey)} className="text-[11px] text-gray-400 hover:text-gray-600 mt-2">
          {showKey ? "▾" : "▸"} 내 Anthropic API 키 사용 (선택 — 무료 AI 대신 Claude 직접 호출)
        </button>
        {showKey && (
          <div className="mt-1.5">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              키는 이 브라우저에만 저장됩니다. 비워 두면 무료 AI(Puter)를 사용해요.
            </p>
          </div>
        )}

        {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-[13px] text-gray-500 px-3 py-1.5">취소</button>
          <button
            onClick={submit}
            disabled={!prompt.trim() || busy}
            className="text-[13px] bg-indigo-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg px-4 py-1.5 font-medium"
          >
            {busy ? "생성 중…" : "위젯 생성"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddWidgetDialog;
