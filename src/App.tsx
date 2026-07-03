import React, { useCallback, useMemo, useState } from "react";
import { ReactGridLayout, WidthProvider, type Layout } from "react-grid-layout/legacy";
import TimetableWidget from "./components/TimetableWidget";
import PollWidget from "./components/PollWidget";
import NoticeWidget from "./components/NoticeWidget";
import MealWidget from "./components/MealWidget";
import CustomWidget from "./components/CustomWidget";
import AddWidgetDialog from "./components/AddWidgetDialog";
import LoginPage from "./components/LoginPage";
import OrgModal from "./components/OrgModal";
import { auth, type Session } from "./lib/auth";
import { orgStore } from "./lib/orgs";
import { dashboardStore, GRID_COLS, GRID_ROW_HEIGHT, type DashboardState } from "./lib/dashboard";
import type { CustomWidgetSpec, Org, WidgetInstance } from "./types";

const Grid = WidthProvider(ReactGridLayout);

interface SidebarProps {
  name: string;
  orgs: Org[];
  onAddOrg: () => void;
  onEditOrg: (org: Org) => void;
  onDeleteOrg: (org: Org) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = React.memo(({ name, orgs, onAddOrg, onEditOrg, onDeleteOrg, onLogout }) => (
  <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
    <div className="flex items-center gap-2.5 px-6 py-6">
      <div className="w-6 h-6 rounded-lg bg-indigo-600" />
      <span className="font-bold text-gray-900">캠퍼스 보드</span>
    </div>
    <nav className="px-3 flex-1 overflow-auto">
      <div className="flex items-center justify-between px-3 mb-2">
        <p className="text-[11px] font-semibold text-gray-400">내 소속</p>
        <button
          onClick={onAddOrg}
          aria-label="소속 추가"
          className="w-5 h-5 rounded-full border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 text-[13px] leading-none grid place-items-center"
        >+</button>
      </div>
      {orgs.map((org) => (
        <div key={org.id} className="flex items-center rounded-lg mb-0.5 hover:bg-gray-50 group">
          <button
            onClick={() => onEditOrg(org)}
            className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left"
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: org.color }} />
            <span className="text-[13px] flex-1 font-medium text-gray-600 truncate">{org.name}</span>
            <span className="text-[10px] text-gray-300 opacity-0 group-hover:opacity-100">편집</span>
          </button>
          <button
            onClick={() => onDeleteOrg(org)}
            aria-label={`${org.name} 삭제`}
            className="shrink-0 w-5 h-5 mr-2 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 text-[12px] leading-none opacity-0 group-hover:opacity-100 grid place-items-center"
          >✕</button>
        </div>
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
  const [orgs, setOrgs] = useState<Org[]>(() => orgStore.load());
  const [dashboard, setDashboard] = useState<DashboardState>(() => dashboardStore.load());
  const [editMode, setEditMode] = useState(false);
  const [orgModal, setOrgModal] = useState<{ open: boolean; org: Org | null }>({ open: false, org: null });
  const [showAddWidget, setShowAddWidget] = useState(false);

  const logout = useCallback(() => {
    auth.logout();
    setSession(null);
  }, []);

  /* ---------- 소속 관리 ---------- */
  const saveOrg = useCallback(
    (name: string, color: string) => {
      setOrgs((prev) =>
        orgModal.org
          ? orgStore.update(prev, { ...orgModal.org, name, color })
          : orgStore.add(prev, { name, color })
      );
    },
    [orgModal.org]
  );

  const deleteOrg = useCallback(() => {
    if (orgModal.org) setOrgs((prev) => orgStore.remove(prev, orgModal.org!.id));
  }, [orgModal.org]);

  const deleteOrgDirect = useCallback((org: Org) => {
    if (window.confirm(`'${org.name}' 소속을 삭제할까요?`)) {
      setOrgs((prev) => orgStore.remove(prev, org.id));
    }
  }, []);

  /* ---------- 대시보드 레이아웃 ---------- */
  const onLayoutChange = useCallback((layout: Layout) => {
    setDashboard((prev) => {
      const next = { ...prev, layout: [...layout] };
      dashboardStore.save(next);
      return next;
    });
  }, []);

  const addWidget = useCallback((spec: CustomWidgetSpec) => {
    setDashboard((prev) => {
      const i = `w${Date.now()}`;
      const next: DashboardState = {
        items: [...prev.items, { i, kind: "custom", spec }],
        layout: [...prev.layout, { i, x: 4, y: Infinity, w: 2, h: 3, minW: 1, minH: 2 }],
      };
      dashboardStore.save(next);
      return next;
    });
  }, []);

  const removeWidget = useCallback((i: string) => {
    setDashboard((prev) => {
      const next: DashboardState = {
        items: prev.items.filter((it) => it.i !== i),
        layout: prev.layout.filter((l) => l.i !== i),
      };
      dashboardStore.save(next);
      return next;
    });
  }, []);

  const resetLayout = useCallback(() => {
    setDashboard(dashboardStore.reset());
  }, []);

  const updateSpec = useCallback((i: string, spec: CustomWidgetSpec) => {
    setDashboard((prev) => {
      const next: DashboardState = {
        ...prev,
        items: prev.items.map((it) => (it.i === i ? { ...it, spec } : it)),
      };
      dashboardStore.save(next);
      return next;
    });
  }, []);

  const renderWidget = useCallback(
    (item: WidgetInstance) => {
      switch (item.kind) {
        case "timetable": return <TimetableWidget orgs={orgs} />;
        case "poll": return <PollWidget />;
        case "meal": return <MealWidget />;
        case "notice": return <NoticeWidget />;
        case "custom":
          return item.spec ? <CustomWidget spec={item.spec} onChange={(s) => updateSpec(item.i, s)} /> : null;
      }
    },
    [orgs, updateSpec]
  );

  const today = useMemo(
    () => new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }),
    []
  );

  if (!session) return <LoginPage onLogin={setSession} />;

  return (
    <div className="flex min-h-screen bg-[#EBEEF3] text-gray-900">
      <Sidebar
        name={session.name}
        orgs={orgs}
        onAddOrg={() => setOrgModal({ open: true, org: null })}
        onEditOrg={(org) => setOrgModal({ open: true, org })}
        onDeleteOrg={deleteOrgDirect}
        onLogout={logout}
      />
      <main className="flex-1 p-8 overflow-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">좋은 아침, {session.name}</h1>
            <p className="text-[13px] text-gray-500 mt-1">{today} · 컴퓨터공학과 보드</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAddWidget(true)}
              className="text-[12px] font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-lg px-3 py-1.5"
            >
              ✦ AI 위젯 추가
            </button>
            {editMode && (
              <button
                onClick={resetLayout}
                className="text-[12px] font-medium text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
              >
                기본 배치로
              </button>
            )}
            <button
              onClick={() => setEditMode(!editMode)}
              className={`text-[12px] font-medium rounded-lg px-3 py-1.5 border ${
                editMode
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {editMode ? "편집 완료" : "레이아웃 편집"}
            </button>
          </div>
        </div>

        {editMode && (
          <p className="text-[12px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mb-4">
            위젯을 드래그해 위치를 옮기고, 오른쪽 아래 모서리를 끌어 크기를 조절하세요. ✕ 로 위젯을 제거할 수 있습니다.
          </p>
        )}

        <Grid
          className={editMode ? "select-none" : ""}
          layout={dashboard.layout}
          cols={GRID_COLS}
          rowHeight={GRID_ROW_HEIGHT}
          margin={[20, 20]}
          containerPadding={[0, 0]}
          isDraggable={editMode}
          isResizable={editMode}
          onLayoutChange={onLayoutChange}
          compactType="vertical"
        >
          {dashboard.items.map((item) => (
            <div key={item.i} className={editMode ? "relative" : ""}>
              {renderWidget(item)}
              {editMode && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-indigo-300 ring-dashed bg-indigo-50/20 cursor-move">
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => removeWidget(item.i)}
                    aria-label={`${item.i} 위젯 제거`}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300 text-[12px] leading-none grid place-items-center shadow"
                  >✕</button>
                </div>
              )}
            </div>
          ))}
        </Grid>
      </main>

      {orgModal.open && (
        <OrgModal
          org={orgModal.org}
          onSave={saveOrg}
          onDelete={orgModal.org ? deleteOrg : undefined}
          onClose={() => setOrgModal({ open: false, org: null })}
        />
      )}
      {showAddWidget && <AddWidgetDialog onAdd={addWidget} onClose={() => setShowAddWidget(false)} />}
    </div>
  );
};

export default App;
