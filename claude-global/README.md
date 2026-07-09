# claude-global — 개인 Claude 글로벌 설정 백업

원격 세션(일회용 컨테이너)에서 만든 글로벌 Claude 설정을 로컬 머신으로 옮기기 위한 폴더입니다.
CampusDashboard 프로젝트 코드와는 무관하며, 로컬에 설치한 뒤 이 폴더는 삭제해도 됩니다.

## 구성

- `CLAUDE.md` — 글로벌 메모리 문서. 기존 `my-prompts` claude.ai 스킬을 md 문서로 이관한 골격 포함.
- `skills/` — GitHub 인기 저장소에서 가져온 스킬 5개
  - `test-driven-development`, `systematic-debugging`, `writing-plans`, `executing-plans`
    — [obra/superpowers](https://github.com/obra/superpowers) (MIT, ⭐250k)
  - `mcp-builder` — [anthropics/skills](https://github.com/anthropics/skills) (Apache 2.0)

## 로컬 설치 방법

```bash
# 글로벌 메모리 (기존 파일이 있으면 내용을 병합하세요)
cp claude-global/CLAUDE.md ~/.claude/CLAUDE.md

# 글로벌 스킬
mkdir -p ~/.claude/skills
cp -r claude-global/skills/* ~/.claude/skills/
```

## 남은 수동 작업 (claude.ai에서만 가능)

1. claude.ai → 설정 → 기능(Capabilities) → 스킬에서 `my-prompts` 스킬 본문을 열어
   세부 프롬프트 템플릿을 `~/.claude/CLAUDE.md`의 해당 절에 병합.
2. 병합 후 `my-prompts` 스킬 삭제(또는 비활성화).
3. `obsidian-organizer`, `team` 스킬은 절차형 워크플로우이므로 유지.
