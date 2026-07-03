import React, { useCallback, useState } from "react";
import { auth, type Session } from "../lib/auth";

interface Props {
  onLogin: (session: Session) => void;
}

export const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!id.trim() || !pw) {
        setError("아이디와 비밀번호를 입력해 주세요.");
        return;
      }
      onLogin(auth.login(id.trim(), name));
    },
    [id, pw, name, onLogin]
  );

  return (
    <div className="min-h-screen bg-[#EBEEF3] grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-xl bg-indigo-600" />
          <span className="text-xl font-bold text-gray-900">캠퍼스 보드</span>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white border border-gray-200 shadow-sm p-6">
          <h1 className="text-sm font-bold text-gray-800 mb-1">학교 계정으로 로그인</h1>
          <p className="text-[11px] text-gray-400 mb-4">
            데모 로그인 — 실제 학교 인증과 연동되지 않으며, 입력한 정보로 이 브라우저에만 세션이 만들어집니다.
          </p>

          <label className="block mb-2.5">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">학번 / 아이디</span>
            <input
              autoFocus
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="2026123456"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label className="block mb-2.5">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">비밀번호</span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label className="block mb-4">
            <span className="block text-[11px] font-semibold text-gray-500 mb-1">이름 (선택 · 대시보드 표시용)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="춘배"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          {error && <p className="text-[11px] text-red-500 mb-3">{error}</p>}

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold rounded-lg py-2.5"
          >
            로그인
          </button>
        </form>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          경북대 SSO 연동은 학교 측 인증 API 발급이 필요해 데모로 대체되어 있습니다.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
