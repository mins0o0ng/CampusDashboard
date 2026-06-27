// types.ts
// 용도: 캠퍼스 대시보드 도메인 타입 정의. 위젯·데이터 계층이 공유하는 단일 출처.

// 요일 인덱스: 0=월 ~ 4=금
export type DayIndex = 0 | 1 | 2 | 3 | 4;

// 위젯 색상 팔레트(SVG 프로토타입 기준)
export type WidgetColor = "indigo" | "red" | "green" | "amber";

// 시간표의 강의 1개
export interface ClassBlock {
  id: string;
  subject: string;     // 과목명
  room?: string;       // 강의실
  day: DayIndex;       // 요일
  start: number;       // 시작 교시(24h, 예: 9, 10.5)
  end: number;         // 종료 교시(24h, 예: 11, 12.5)
  color: WidgetColor;
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
  votedOptionId?: string; // 내가 투표한 선택지(로컬). 없으면 미투표
}
