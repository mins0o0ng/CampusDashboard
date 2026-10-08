// mealManual.ts
// 용도: 사람이 직접 올리는 식단표(수동 업로드) 저장소. 자동 수집이 막혔을 때의 백업이자
//       가장 확실한 출처라서, 같은 날짜·식당에 수동 식단이 있으면 수집본보다 우선한다.
//
// 저장 구조(사이트 자체 테이블 = public/data/meal_manual.json):
//   { updated_at, shops: { "35": "학생식당", ... }, days: { "YYYY-MM-DD": { "35": MealSection[], "36": [...] } } }
//
// 흐름: 편집 → 이 브라우저에 임시저장(localStorage) → "게시" 시 GitHub API 로 위 JSON 을
//       main 에 커밋 → push 트리거로 Pages 재배포 → 모든 방문자에게 반영.
//       서버가 없는 정적 사이트라 게시 권한은 관리자의 GitHub 토큰으로 대신한다.

import type { MealItem, MealSection } from "./staticData";
import type { ShopNames } from "./shops";
import { ensureSession, supabase } from "./supabase";

export type ShopDays = Record<string, MealSection[]>; // shopCode → 끼니 목록
export type MealTable = Record<string, ShopDays>; // "YYYY-MM-DD" → 식당별 식단

export interface ManualMealFile {
  updated_at: string | null;
  shops: ShopNames; // 일괄 가져오기로 발견한 식당 이름(기본 3곳 외)
  days: MealTable;
}

export const MEAL_SLOTS = ["조식", "중식", "석식"] as const;

const DATA_PATH = "public/data/meal_manual.json";
const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? "mins0o0ng/CampusDashboard";
const BRANCH = "main";
const DRAFT_KEY = "campus.mealDrafts";
const TOKEN_KEY = "campus.githubToken";

/* ==================== 날짜 유틸 ==================== */

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ==================== 텍스트 ↔ 메뉴 변환 ==================== */

// 한 줄 = 메뉴 하나. 끝의 숫자는 가격으로 읽는다. 예: "순살돈가스 4,500" / "흰밥 ￦6000원"
const PRICE_TAIL = /^(.*?)[\s/·:-]*(?:￦|₩)?\s*([\d,]{3,})\s*원?\s*$/;

export function parseMenuText(text: string, time: string | null): MealItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(PRICE_TAIL);
      if (m && m[1].trim()) {
        return { name: m[1].trim(), price: Number(m[2].replace(/,/g, "")), time };
      }
      return { name: line, price: null, time };
    });
}

export function menuToText(items: MealItem[]): string {
  return items.map((i) => (i.price == null ? i.name : `${i.name} ${i.price.toLocaleString("ko-KR")}`)).join("\n");
}

/* ==================== 게시본(공유) ==================== */

// Supabase 가 설정되면 식단은 DB 에서 공유된다(누구나 게시, 변경 기록은 DB 의 meal_history).
// 설정이 없으면 기존처럼 저장소의 meal_manual.json 을 GitHub 토큰으로 커밋한다.
export const sharedMeals = supabase !== null;

async function fetchFile(): Promise<ManualMealFile> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + "data/meal_manual.json", { cache: "no-cache" });
    if (!res.ok) return { updated_at: null, shops: {}, days: {} };
    const json = (await res.json()) as Partial<ManualMealFile>;
    return { updated_at: json.updated_at ?? null, shops: json.shops ?? {}, days: json.days ?? {} };
  } catch {
    return { updated_at: null, shops: {}, days: {} };
  }
}

async function fetchShared(): Promise<{ days: MealTable; shops: ShopNames }> {
  const { data, error } = await supabase!.rpc("get_meals");
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { days?: MealTable; shops?: ShopNames };
  return { days: d.days ?? {}, shops: d.shops ?? {} };
}

// 게시본 = 저장소 파일(이전에 토큰으로 올린 것) + Supabase(공유 모드). 같은 날·식당은 Supabase 가 우선.
export async function fetchPublished(): Promise<ManualMealFile> {
  const file = await fetchFile();
  if (!sharedMeals) return file;
  try {
    const shared = await fetchShared();
    const days: MealTable = { ...file.days };
    for (const [day, shops] of Object.entries(shared.days)) days[day] = { ...(days[day] ?? {}), ...shops };
    return { updated_at: file.updated_at, shops: { ...file.shops, ...shared.shops }, days };
  } catch {
    return file; // Supabase 장애 시에도 파일 식단은 보인다
  }
}

// 공유 모드 게시: 초안을 DB 에 올리고 최신 게시본을 돌려준다. 바로 반영된다(재배포 불필요).
export async function publishShared(drafts: MealTable, newShops: ShopNames = {}): Promise<{ days: MealTable; shops: ShopNames }> {
  await ensureSession();
  const entries = Object.entries(drafts).flatMap(([day, shops]) =>
    Object.entries(shops).map(([shop, sections]) => ({ day, shop: Number(shop), sections }))
  );
  // DB 함수는 한 번에 300건까지 받는다.
  for (let i = 0; i < entries.length || i === 0; i += 300) {
    const { error } = await supabase!.rpc("publish_meals", {
      p_entries: entries.slice(i, i + 300),
      p_shops: i === 0 ? newShops : {},
    });
    if (error) throw new Error(error.message);
  }
  const all = await fetchPublished();
  return { days: all.days, shops: all.shops };
}

/* ==================== 임시저장(이 브라우저) ==================== */

// 값이 [] 이면 "이 날짜·식당 식단 삭제" 를 뜻한다(게시 시 반영).
export const draftStore = {
  load(): MealTable {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as MealTable) : {};
    } catch {
      return {};
    }
  },
  save(drafts: MealTable): void {
    try {
      if (Object.keys(drafts).length === 0) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {
      /* 저장 실패는 무시 */
    }
  },
  set(drafts: MealTable, day: string, shop: number, sections: MealSection[]): MealTable {
    const next = { ...drafts, [day]: { ...(drafts[day] ?? {}), [shop]: sections } };
    this.save(next);
    return next;
  },
};

export function countDrafts(drafts: MealTable): number {
  return Object.values(drafts).reduce((n, shops) => n + Object.keys(shops).length, 0);
}

// 게시본 위에 임시저장을 덮어쓴 결과. 빈 배열 초안은 해당 항목 삭제.
export function mergeTables(base: MealTable, drafts: MealTable): MealTable {
  const out: MealTable = {};
  for (const [day, shops] of Object.entries(base)) out[day] = { ...shops };
  for (const [day, shops] of Object.entries(drafts)) {
    const merged: ShopDays = { ...(out[day] ?? {}) };
    for (const [shop, sections] of Object.entries(shops)) {
      if (sections.length === 0) delete merged[shop];
      else merged[shop] = sections;
    }
    if (Object.keys(merged).length === 0) delete out[day];
    else out[day] = merged;
  }
  return out;
}

export function exportJson(table: MealTable, shops: ShopNames = {}): string {
  const sorted: MealTable = {};
  for (const day of Object.keys(table).sort()) sorted[day] = table[day];
  const file: ManualMealFile = { updated_at: new Date().toISOString(), shops, days: sorted };
  return JSON.stringify(file, null, 2) + "\n";
}

/* ==================== 게시(GitHub 커밋) ==================== */

export const tokenStore = {
  load(): string {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  },
  save(token: string): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* 무시 */
    }
  },
};

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// 저장소의 최신 게시본에 초안(과 새로 발견한 식당 이름)을 병합해 커밋한다. 배포 반영까지 1~2분 걸린다.
export async function publishDrafts(
  token: string,
  drafts: MealTable,
  newShops: ShopNames = {}
): Promise<{ days: MealTable; shops: ShopNames }> {
  const api = `https://api.github.com/repos/${REPO}/contents/${DATA_PATH}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // 배포본은 수 분 늦을 수 있으므로, 덮어쓰기 전에 저장소의 현재 파일을 기준으로 병합한다.
  let sha: string | undefined;
  let base: MealTable = {};
  let baseShops: ShopNames = {};
  const cur = await fetch(`${api}?ref=${BRANCH}`, { headers, cache: "no-store" });
  if (cur.ok) {
    const json = await cur.json();
    sha = json.sha;
    const file = JSON.parse(fromBase64Utf8(json.content)) as Partial<ManualMealFile>;
    base = file.days ?? {};
    baseShops = file.shops ?? {};
  } else if (cur.status !== 404) {
    throw new Error(publishError(cur.status));
  }

  const merged = mergeTables(base, drafts);
  const shops = { ...baseShops, ...newShops };
  const days = Object.keys(drafts).sort();
  const message = `chore(meal): 식단 수동 업로드 (${days[0]}${days.length > 1 ? ` 외 ${days.length - 1}일` : ""})`;
  const res = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({ message, content: toBase64Utf8(exportJson(merged, shops)), sha, branch: BRANCH }),
  });
  if (!res.ok) throw new Error(publishError(res.status));
  return { days: merged, shops };
}

function publishError(status: number): string {
  if (status === 401) return "토큰이 올바르지 않거나 만료되었습니다.";
  if (status === 403 || status === 404) return "이 저장소에 쓰기 권한이 없는 토큰입니다(Contents: Read and write 필요).";
  if (status === 409) return "다른 게시와 충돌했습니다. 잠시 후 다시 시도해 주세요.";
  return `게시 실패 (HTTP ${status})`;
}
