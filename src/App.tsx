import React, { useCallback, useMemo, useState } from "react";
import TimetableWidget from "./components/TimetableWidget";
import PollWidget from "./components/PollWidget";
import NoticeWidget from "./components/NoticeWidget";
import MealWidget from "./components/MealWidget";
import LoginPage from "./components/LoginPage";
import { auth, type Session } from "./lib/auth";

const ORGS: [string, string, boolean, number | null][] = [
  ["개인", "bg-slate-400", false, null],
  ["컴퓨터공학과", "bg-indigo-600", true, 32],
  ["블로우파이프 동아리", "bg-red-500", false, null],
  ["캡스톤 디자인 4조", "bg-green-600", false, null],
];

interface SidebarProps {
  name: string;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ name, onLogout }) => (
  <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
    <div className="flex items-center gap-2.5 px-6 py-6">
      <div className="w-6 h-6 rounded-lg bg-indigo-600" />
      <span className="font-bold text-gray-900">캠퍼스 보드</span>
    </div>
    <nav className="px-3 flex-1">
      <p className="text-[11px] font-semibold text-gray-400 px-3 mb-2">내 소속</p>
      {ORGS.map(([n, c, a, b]) => (
        <button key={n} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 mb-0.5 ${a ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
          <span className={`w-2 h-2 rounded-full ${c}`} />
          <span className={`text-[13px] flex-1 text-left ${a ? "font-bold text-indigo-600" : "font-medium text-gray-600"}`}>{n}</span>
          {b && <span className="text-[10px] font-semibold text-white bg-indigo-600 rounded-full px-2 py-0.5">{b}</span>}
        </button>
      ))}
    </nav>
    <div className="flex items-center gap-2.5 px-5 py-5 border-t border-gray-100">
      <div className="w-8 h-8 rounded-full bg-indigo-600 grid place-items-center text-white text-[13px] font-bold">{name.slice(0, 1)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-900 truncate">{name}</p>
        <button onClick={onLogout} className="text-[11px] text-gray-400 hover:text-gray-600">로그아웃</button>
      </div>
    </div>
  </aside>
));

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(() => auth.load());

  const logout = useCallback(() => {
    auth.logout();
    setSession(null);
  }, []);

  const today = useMemo(
    () => new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }),
    []
  );

  if (!session) return <LoginPage onLogin={setSession} />;

  return (
    <div className="flex min-h-screen bg-[#EBEEF3] text-gray-900">
      <Sidebar name={session.name} onLogout={logout} />
      <main className="flex-1 p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">좋은 아침, {session.name}</h1>
          <p className="text-[13px] text-gray-500 mt-1">{today} · 컴퓨터공학과 보드</p>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2"><TimetableWidget /></div>
          <div className="space-y-5">
            <PollWidget />
            <MealWidget />
          </div>
          <div className="col-span-2"><NoticeWidget /></div>
        </div>
      </main>
    </div>
  );
};

export default App;
