// aiWidget.ts
// 용도: 자연어 설명 → 커스텀 위젯 스펙(CustomWidgetSpec) 생성. 3단계 폴백:
//       1) 사용자 Anthropic API 키가 있으면 Claude 직접 호출
//       2) 없으면 무료 AI(Puter.js — 키 불필요, 브라우저에서 직접 호출)
//       3) 그것도 실패하면 키워드 규칙 기반(오프라인 폴백)
//       정적 사이트라 서버가 없으므로 키는 이 브라우저의 localStorage 에만 저장된다.

import Anthropic from "@anthropic-ai/sdk";
import type { CustomWidgetSpec, WidgetColor } from "../types";

const KEY_STORAGE = "campus.anthropicKey";

export const apiKeyStore = {
  load(): string {
    try {
      return localStorage.getItem(KEY_STORAGE) ?? "";
    } catch {
      return "";
    }
  },
  save(key: string): void {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {
      /* 무시 */
    }
  },
};

const SYSTEM_PROMPT = `너는 대학생 대시보드의 위젯 생성기다. 사용자의 설명을 읽고 아래 4가지 중 가장 알맞은 위젯 스펙을 JSON 하나로만 응답한다. 설명이 한국어면 내용도 한국어로 쓴다.

스키마(반드시 이 중 하나):
{"type":"note","title":string,"color":"indigo"|"red"|"green"|"amber","text":string}
{"type":"checklist","title":string,"color":...,"items":[{"label":string,"done":false}]}
{"type":"dday","title":string,"color":...,"date":"YYYY-MM-DD","label":string}
{"type":"links","title":string,"color":...,"links":[{"label":string,"url":string}]}

규칙: JSON 외 다른 텍스트 금지. 오늘 날짜는 ${new Date().toISOString().slice(0, 10)}.`;

function stripFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function isValidSpec(s: any): s is CustomWidgetSpec {
  if (!s || typeof s.title !== "string") return false;
  if (!["indigo", "red", "green", "amber"].includes(s.color)) s.color = "indigo";
  switch (s.type) {
    case "note": return typeof s.text === "string";
    case "checklist": return Array.isArray(s.items) && s.items.every((i: any) => typeof i?.label === "string");
    case "dday": return typeof s.date === "string" && typeof s.label === "string";
    case "links": return Array.isArray(s.links) && s.links.every((l: any) => typeof l?.label === "string" && typeof l?.url === "string");
    default: return false;
  }
}

async function generateWithClaude(prompt: string, apiKey: string): Promise<CustomWidgetSpec> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const spec = JSON.parse(stripFence(text));
  if (!isValidSpec(spec)) throw new Error("AI 응답이 위젯 스키마와 맞지 않습니다.");
  return spec;
}

/* ==================== 무료 AI (Puter.js) ==================== */

// Puter.js 를 필요할 때만 로드한다. 키 없이 쓸 수 있는 무료 브라우저 AI SDK.
// 첫 호출 시 방문자에게 Puter 로그인 팝업이 뜰 수 있다(사용자 클릭 시점에만 호출됨).
declare global {
  interface Window {
    puter?: { ai: { chat: (prompt: string, options?: Record<string, unknown>) => Promise<unknown> } };
  }
}

let puterLoading: Promise<void> | null = null;

function loadPuter(): Promise<void> {
  if (window.puter) return Promise.resolve();
  if (!puterLoading) {
    puterLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.puter.com/v2/";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        puterLoading = null;
        reject(new Error("Puter SDK 로드 실패"));
      };
      document.head.appendChild(script);
    });
  }
  return puterLoading;
}

// Puter 응답에서 텍스트를 최대한 안전하게 추출한다(버전에 따라 형태가 다름).
function puterText(res: unknown): string {
  if (typeof res === "string") return res;
  const r = res as any;
  const content = r?.message?.content ?? r?.text ?? r?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("");
  }
  return String(res);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("시간 초과")), ms)),
  ]);
}

async function generateWithPuter(prompt: string): Promise<CustomWidgetSpec> {
  await withTimeout(loadPuter(), 15_000);
  if (!window.puter) throw new Error("Puter SDK 없음");
  const res = await withTimeout(
    window.puter.ai.chat(`${SYSTEM_PROMPT}\n\n사용자 요청: ${prompt}`),
    45_000
  );
  const spec = JSON.parse(stripFence(puterText(res)));
  if (!isValidSpec(spec)) throw new Error("AI 응답이 위젯 스키마와 맞지 않습니다.");
  return spec;
}

/* ==================== 키워드 규칙 폴백 ==================== */

const COLOR_POOL: WidgetColor[] = ["indigo", "red", "green", "amber"];

function pickColor(prompt: string): WidgetColor {
  let hash = 0;
  for (const ch of prompt) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLOR_POOL[Math.abs(hash) % COLOR_POOL.length];
}

function extractDate(prompt: string): string | null {
  const iso = prompt.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const md = prompt.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    const now = new Date();
    const candidate = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    if (candidate < now) candidate.setFullYear(candidate.getFullYear() + 1);
    return candidate.toISOString().slice(0, 10);
  }
  return null;
}

function splitItems(prompt: string): string[] {
  return prompt
    .split(/[,،、\n·;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40)
    .slice(0, 8);
}

function generateFallback(prompt: string): CustomWidgetSpec {
  const color = pickColor(prompt);
  const title = prompt.length <= 18 ? prompt : prompt.slice(0, 18) + "…";
  const date = extractDate(prompt);

  if (date || /d-?day|디데이|시험|마감|까지/i.test(prompt)) {
    return {
      type: "dday",
      title: "D-Day",
      color,
      date: date ?? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      label: title,
    };
  }
  if (/체크|할\s*일|투두|todo|리스트|준비물/i.test(prompt)) {
    const items = splitItems(prompt.replace(/체크리스트|할\s*일|투두|todo/gi, ""));
    return {
      type: "checklist",
      title,
      color,
      items: (items.length > 0 ? items : ["첫 번째 할 일"]).map((label) => ({ label, done: false })),
    };
  }
  if (/링크|사이트|바로가기|북마크|url/i.test(prompt)) {
    return {
      type: "links",
      title,
      color,
      links: [
        { label: "경북대 포털", url: "https://portal.knu.ac.kr" },
        { label: "LMS", url: "https://lms.knu.ac.kr" },
      ],
    };
  }
  return { type: "note", title, color, text: prompt };
}

/* ==================== 공개 API ==================== */

export interface GenerateResult {
  spec: CustomWidgetSpec;
  source: "claude" | "puter" | "fallback";
}

export async function generateWidget(prompt: string): Promise<GenerateResult> {
  const apiKey = apiKeyStore.load();
  if (apiKey) {
    try {
      return { spec: await generateWithClaude(prompt, apiKey), source: "claude" };
    } catch (e) {
      console.warn("Claude 위젯 생성 실패 — 무료 AI 로 폴백:", e);
    }
  }
  try {
    return { spec: await generateWithPuter(prompt), source: "puter" };
  } catch (e) {
    console.warn("무료 AI(Puter) 생성 실패 — 규칙 기반으로 폴백:", e);
  }
  return { spec: generateFallback(prompt), source: "fallback" };
}
