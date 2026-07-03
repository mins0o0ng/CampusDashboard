// staticData.ts
// 용도: 정적 배포(GitHub Pages)에서 스크래핑된 JSON(data/*.json)을 읽는 클라이언트.
//       scrape 워크플로우가 public/data 에 결과를 커밋하고, 빌드 시 dist/data 로 포함된다.
//       백엔드 없이도 공지·학식 위젯이 실데이터로 동작한다.

export interface Notice {
  no: string;
  title: string;
  author: string;
  date: string;
  views: number;
  url: string;
  has_file: boolean;
  is_new: boolean;
  pinned: boolean;
}

export interface NoticesPayload {
  board: string;
  scraped_at: string;
  count: number;
  notices: Notice[];
}

export interface MealItem {
  name: string;
  price: number | null;
  time: string | null;
}

export interface MealSection {
  meal: string; // 조식/중식/석식
  items: MealItem[];
}

export interface MealPayload {
  day: string | null;
  scraped_at: string;
  meals: MealSection[];
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + path, { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // 네트워크 실패·JSON 파싱 실패 → 위젯이 빈 상태 처리
  }
}

export const staticData = {
  notices: () => fetchJson<NoticesPayload>("data/notices.json"),
  meal: () => fetchJson<MealPayload>("data/meal.json"),
};
