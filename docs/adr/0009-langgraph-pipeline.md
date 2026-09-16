# ADR 0009: 채팅 파이프라인은 LangGraph가 소유한다

**Status:** Accepted  
**Date:** 2026-09-11  
**Supersedes:** ADR 0005의 “LangGraph는 단일 LLM 노드, v1에서 스트리밍 노드로 확장하지 않음”  
**Note:** `rewrite → retrieve → inject` 노드는 [ADR 0010](./0010-retrieve-as-answer-tool.md)이 대체했고, 도구 루프는 [ADR 0011](./0011-retrieve-sufficiency-evaluator.md)이 대체. 그래프는 `load_history → prepare → retrieve → evaluate → answer`이고 부족하면 evaluate에서 retrieve로 돌아간다.

## Context

파이프라인(히스토리 로드 → retrieve 쿼리 리라이트 → retrieve → inject → truncate → 답변 LLM)이 `ChatService`에 있고, LangGraph는 `model.invoke` 한 칸이었습니다. 그래프 비용은 내고 오케스트레이션은 서비스에 있어 단계가 늘수록 어긋납니다.

## Decision

**LangGraph가 채팅 파이프라인을 소유**합니다.

노드: `load_history → prepare(system+truncate) → retrieve → evaluate → answer` ([ADR 0011](./0011-retrieve-sufficiency-evaluator.md)). evaluate가 부족하면 retrieve로 돌아가고, 충분하거나 3회면 answer. 그래프는 JSON/SSE가 나누지 않는다.

- **`POST /chat/stream`**: 제품 경로. 같은 그래프 `invoke`에 스트림 콜백을 넘기고, 답변은 `stream()`.
- **`POST /chat`**: 같은 그래프 `invoke`. 답변은 모아 JSON으로 준다.
- **`ChatService`**: HTTP 어댑터. 409/410 사전 검사, SSE 매핑, abort, 성공 시 append.

## Consequences

- 파이프라인 추가 단계는 그래프 노드로 붙입니다.
- SSE `delta`는 그래프 노드 스트리밍이 아니라 답변 LLM `stream()`입니다. 스트림 실패 시에만 청크 폴백합니다.
