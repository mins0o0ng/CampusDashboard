# 글로벌 개인 설정 (Bae)

## 개인 유틸리티 프롬프트 (구 my-prompts 스킬에서 이관)

> ⚠️ 이 섹션은 claude.ai의 `my-prompts` 스킬을 md 문서로 이관한 것입니다.
> 원본 SKILL.md의 세부 템플릿 내용은 claude.ai → 설정 → 기능 → 스킬에서 복사해
> 아래 각 절에 병합한 뒤, 스킬을 삭제하세요. 아래는 기본 골격과 요약 규칙입니다.

### 코드 생성 (React / API / Python)
- React: 함수형 컴포넌트 + hooks, TypeScript 우선. props 인터페이스를 명시하고 컴포넌트당 하나의 책임.
- API: 입력 검증 → 처리 → 일관된 에러 응답 구조. 상태 코드와 에러 메시지를 명시적으로.
- Python: 타입 힌트 필수, 표준 라이브러리 우선, 함수 단위로 작게.

### Git 워크플로우 (커밋 / PR / 브랜치 / 배포)
- 커밋 메시지는 Conventional Commits(`feat:`, `fix:`, `chore:` …) 형식.
- 브랜치는 `feature/…`, `fix/…` 네이밍. main 직접 푸시 금지.
- PR에는 변경 요약, 테스트 방법, 스크린샷(UI 변경 시) 포함.

### 코드 리뷰 (품질 / 보안 / 성능)
- 보안은 OWASP Top 10 기준으로 점검: 인젝션, 인증/세션, 민감정보 노출, 접근 제어 등.
- 품질: 중복, 불필요한 복잡도, 네이밍, 테스트 커버리지.
- 성능: N+1 쿼리, 불필요한 리렌더링, 메모리 누수.

### 프로젝트 관리 연동 (Slack / Notion / 이메일)
- 작업 결과 공유는 Slack, 문서화는 Notion, 외부 커뮤니케이션은 이메일 초안으로.
- 공유 전 민감정보(토큰, 개인정보) 포함 여부를 항상 확인.

### Obsidian (MCP 노트 관리)
- 노트 정리·볼트 구조 작업은 `obsidian-organizer` 스킬이 담당 (스킬 유지).
- 새 노트는 볼트의 기존 폴더 구조와 태그 컨벤션을 따른다.

### Figma (MCP 디자인 작업)
- 디자인 확인·구현 시 Figma MCP 도구로 실제 디자인 컨텍스트를 가져온 뒤 작업.
- 임의로 디자인을 추측하지 말고 스크린샷/변수 정의를 확인.

## 스킬 구성 메모
- 유지 중인 커스텀 스킬: `obsidian-organizer`(절차형), `team`(14인 가상 팀 검증 워크플로우).
- `my-prompts` 스킬은 이 문서로 이관 후 삭제 대상.
- 글로벌 스킬(`~/.claude/skills/`)에 추가됨: test-driven-development, systematic-debugging,
  writing-plans, executing-plans (출처: obra/superpowers), mcp-builder (출처: anthropics/skills).
