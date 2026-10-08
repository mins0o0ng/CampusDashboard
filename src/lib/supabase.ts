// supabase.ts
// 용도: Supabase 클라이언트. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정된 빌드에서만 켜진다.
//       설정이 없으면 null → 각 기능은 기존처럼 브라우저 저장(localStorage)으로 동작한다.
//       anon(공개) 키는 브라우저에 노출돼도 되는 키다. 실제 권한은 DB 의 RLS·함수(supabase/schema.sql)가 막는다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

let sessionPromise: Promise<void> | null = null;

// 쓰기(투표 등) 전에 로그인 세션을 보장한다. 지금은 익명 로그인 → 브라우저마다 1명으로 센다.
// (Supabase 대시보드에서 Anonymous sign-ins 를 켜야 한다.)
export function ensureSession(): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw new Error(`로그인 실패: ${error.message} (Supabase 에서 Anonymous sign-ins 를 켰는지 확인하세요)`);
    })().catch((e) => {
      sessionPromise = null; // 다음 시도에서 다시 로그인
      throw e;
    });
  }
  return sessionPromise;
}
