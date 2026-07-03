// types.ts
// 용도: 캠퍼스 대시보드 도메인 타입 정의. 위젯·데이터 계층이 공유하는 단일 출처.

// 요일 인덱스: 0=월 ~ 4=금
export type DayIndex = 0 | 1 | 2 | 3 | 4;

// 위젯 색상 팔레트(SVG 프로토타입 기준)
export type WidgetColor = "indigo" | "red" | "green" | "amber";

// 소속(과·동아리·수업그룹). 사이드바와 시간표가 공유.
// color 는 hex 문자열(예: "#4F46E5") — 팔레트에서 자유 선택.
export interface Org {
  id: string;
  name: string;
  color: string;
}

// 시간표의 강의 1개
export interface ClassBlock {
  id: string;
  subject: string;     // 과목명
  room?: string;       // 강의실
  day: DayIndex;       // 요일
  start: number;       // 시작 교시(24h, 예: 9, 10.5)
  end: number;         // 종료 교시(24h, 예: 11, 12.5)
  color: WidgetColor;
  orgId?: string;      // 연결된 소속 id (없으면 개인 일정)
}

// 투표 선택지
export interface PollOption {
  id: string;
  label: string;
  votes: number;       // 득표수
}

// 투표 1개
export interface Poll {
  id: string;
  title: string;
  owner: string;       // 주최(예: 학생회)
  options: PollOption[];
  total: number;       // 전체 투표 가능 인원
  deadline: string;    // ISO 날짜 (마감일)
  votedOptionId?: string | null; // 내가 투표한 선택지. 백엔드는 null, 로컬은 undefined
}

/* ==================== 커스텀(AI 생성) 위젯 ==================== */

// AI 가 생성하는 위젯의 선언적 스펙. CustomWidget 이 이 스펙을 렌더링한다.
export type CustomWidgetSpec =
  | { type: "note"; title: string; color: WidgetColor; text: string }
  | { type: "checklist"; title: string; color: WidgetColor; items: { label: string; done: boolean }[] }
  | { type: "dday"; title: string; color: WidgetColor; date: string; label: string }
  | { type: "links"; title: string; color: WidgetColor; links: { label: string; url: string }[] };

// 대시보드에 배치된 위젯 1개
export type WidgetKind = "timetable" | "poll" | "meal" | "notice" | "custom";

export interface WidgetInstance {
  i: string;              // 그리드 아이템 key
  kind: WidgetKind;
  spec?: CustomWidgetSpec; // kind === "custom" 일 때만
}
