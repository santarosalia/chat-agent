# ADR 0011: retrieve 충분성은 별도 평가기가 판단한다

**Status:** Accepted  
**Date:** 2026-09-16  
**Supersedes:** ADR 0010의 답변 LLM `retrieve_documents` 도구 루프

## Context

시드 retrieve 뒤 추가 검색을 답변 LLM 도구에 맡기면, 모델이 검색을 건너뛰고 “다른 키워드로 물어달라”고 답한다. 검색 이력과 부족 항목을 서버가 들고 다음 쿼리를 정해야 한다.

## Decision

답변 LLM과 **평가기 LLM을 분리**한다. 평가기만 retrieve 충분성을 보고, 출력은 JSON 한 객체다.

```json
{ "sufficient": false, "missing": ["B의 적용 조건", "B의 예외 사항"], "confidence": 0.72 }
```

- **평가기:** 같은 vLLM 엔드포인트, `max_tokens: 200`, temperature 0. 사용자에게 답하지 않는다.
- **search history / evaluation history:** 라운드마다 쌓아 다음 평가 입력에 넣는다. 클라이언트 응답에는 실리지 않는다.
- **retrieve 상한 3회.** `top_k`는 1회 5, 2회 10, 3회 20. 요청 `top_k`는 이 스케줄을 바꾸지 않는다.
- **1회 query**는 마지막 user 원문. **이후 query**는 직전 `missing`을 공백으로 이은 문자열. `missing`이 비면 마지막 user로 다시 검색한다.
- **citations**는 라운드 결과를 누적(중복 제거)한다. 충분하면 루프를 끊고 답변 LLM은 `[Retrieved context]`만 근거로 답한다. 도구 호출은 없다.
- **그래프:** `load_history → prepare → llm`. llm 노드가 retrieve-evaluate 후 답한다. SSE는 루프가 끝난 뒤 `meta`, 답변은 `stream()`.

## Consequences

- 추가 검색 여부가 답변 모델 tool call에 의존하지 않는다.
- 평가기 실패·JSON 파싱 실패는 `sufficient: false`로 보고 다음 라운드로 간다. 3회 후에도 부족하면 그때까지의 citations로 답한다.
- 인사 턴에도 최소 1회 retrieve가 있다.
- 요청 `top_k`는 retrieve 스케줄과 분리된다.
