// auth.ts
// 용도: 데모 로그인 세션 관리. 학교 SSO 는 외부 개발자에게 공개된 인증 API 가 없어
//       실연동 대신 브라우저 로컬 세션으로 로그인 흐름을 재현한다.
//       실제 서비스 전환 시 login() 내부만 학교 SSO/OAuth 콜백으로 교체하면 된다.

export interface Session {
  id: string;       // 학번/아이디
  name: string;     // 표시 이름
  loggedInAt: string;
}

const KEY = "campus.session";

export const auth = {
  load(): Session | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },

  // 데모: 아이디·비밀번호 형식만 확인하고 세션을 만든다(서버 검증 없음).
  login(id: string, name?: string): Session {
    const session: Session = {
      id,
      name: name?.trim() || id,
      loggedInAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* 프라이빗 모드 등 저장 실패 시 메모리 세션으로만 동작 */
    }
    return session;
  },

  logout(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
  },
};
