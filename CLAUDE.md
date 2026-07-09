# CampusDashboard 작업 지침

## 코드 리뷰
- `/code-review` 스킬을 실행할 때는 반드시 스킬이 정의한 풀 파이프라인을 따른다:
  검토 관점(finder)마다 **별도 서브에이전트(Agent tool)** 를 띄워 독립적으로 후보를 수집하고,
  각 후보는 **별도 검증 에이전트**로 CONFIRMED/PLAUSIBLE/REFUTED 판정을 받는다.
  코드가 작거나 컨텍스트에 이미 있다는 이유로 인라인 검토로 대체하지 않는다.
