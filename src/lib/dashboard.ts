// dashboard.ts
// 용도: 대시보드 위젯 구성(어떤 위젯이 있는지)과 그리드 레이아웃(위치·크기)의
//       localStorage 스토어. 레이아웃 편집 모드가 이 데이터를 갱신한다.

import type { LayoutItem } from "react-grid-layout/legacy";
import type { WidgetInstance } from "../types";

const KEY = "campus.dashboard";

export const GRID_COLS = 6;
export const GRID_ROW_HEIGHT = 56;

export interface DashboardState {
  items: WidgetInstance[];
  layout: LayoutItem[];
}

export const DEFAULT_DASHBOARD: DashboardState = {
  items: [
    { i: "timetable", kind: "timetable" },
    { i: "poll", kind: "poll" },
    { i: "meal", kind: "meal" },
    { i: "notice", kind: "notice" },
  ],
  layout: [
    { i: "timetable", x: 0, y: 0, w: 4, h: 8, minW: 2, minH: 4 },
    { i: "poll", x: 4, y: 0, w: 2, h: 4, minW: 1, minH: 3 },
    { i: "meal", x: 4, y: 4, w: 2, h: 4, minW: 1, minH: 3 },
    { i: "notice", x: 0, y: 8, w: 4, h: 5, minW: 2, minH: 3 },
  ],
};

export const dashboardStore = {
  load(): DashboardState {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as DashboardState) : null;
      if (parsed && parsed.items?.length > 0 && parsed.layout?.length > 0) return parsed;
      return DEFAULT_DASHBOARD;
    } catch {
      return DEFAULT_DASHBOARD;
    }
  },
  save(state: DashboardState): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 저장 실패는 무시 */
    }
  },
  reset(): DashboardState {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
    return DEFAULT_DASHBOARD;
  },
};
