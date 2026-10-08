// shops.ts
// 용도: 식당 목록과 "내 식당" 선택.
//       기본 3곳에 더해, 생협 일괄 가져오기(북마클릿)로 발견한 식당이 목록에 추가된다.
//       발견한 이름은 게시 시 meal_manual.json 의 shops 에 함께 저장되어 모든 방문자가 공유한다.

import { RESTAURANTS } from "./staticData";

export interface Shop {
  code: number;
  name: string;
}

export type ShopNames = Record<string, string>; // "35" → "학생식당"

const NAMES_KEY = "campus.mealShopNames"; // 이 브라우저에서 새로 발견한(아직 게시 전) 식당 이름
const MINE_KEY = "campus.myShops";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export const shopNameStore = {
  load: (): ShopNames => readJson<ShopNames>(NAMES_KEY, {}),
  add(names: ShopNames): ShopNames {
    const next = { ...this.load(), ...names };
    writeJson(NAMES_KEY, next);
    return next;
  },
  clear(): void {
    try {
      localStorage.removeItem(NAMES_KEY);
    } catch {
      /* 무시 */
    }
  },
};

// 기본 목록 + 게시된 이름 + 이 브라우저에서 발견한 이름 + 데이터에만 있는 코드. 코드 순 정렬.
export function knownShops(...nameMaps: ShopNames[]): Shop[] {
  const names: ShopNames = {};
  for (const r of RESTAURANTS) names[r.code] = r.name;
  for (const m of nameMaps) for (const [code, name] of Object.entries(m)) if (name) names[code] = name;
  return Object.entries(names)
    .map(([code, name]) => ({ code: Number(code), name }))
    .sort((a, b) => a.code - b.code);
}

export const myShopsStore = {
  // 저장된 선택이 없으면 기본 3곳.
  load(): number[] {
    return readJson<number[]>(MINE_KEY, RESTAURANTS.map((r) => r.code));
  },
  save(codes: number[]): void {
    writeJson(MINE_KEY, codes);
  },
};
