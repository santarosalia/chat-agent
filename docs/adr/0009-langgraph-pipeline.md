# ADR 0009: 채팅 파이프라인은 LangGraph가 소유한다

**Status:** Accepted  
**Date:** 2026-09-11  
**Supersedes:** ADR 0005의 “LangGraph는 단일 LLM 노드, v1에서 스트리밍 노드로 확장하지 않음”

## Context

파이프라인(히스토리 로드 → retrieve 쿼리 리라이트 → retrieve → inject → truncate → 답변 LLM)이 `ChatService`에 있고, LangGraph는 `model.invoke` 한 칸이었습니다. 그래프 비용은 내고 오케스트레이션은 서비스에 있어 단계가 늘수록 어긋납니다.

## Decision

**LangGraph가 채팅 파이프라인을 소유**합니다.

노드: `load_history → rewrite → retrieve → prepare(inject+truncate) → llm`.

- **`POST /chat`**: 전체 그래프 `invoke`.
- **`POST /chat/stream`**: 같은 노드를 `includeLlm: false`로 컴파일한 prepare 그래프를 `invoke`한 뒤 `meta`를 보내고, 답변만 `ChatOpenAI.stream()`합니다. 스트림이 비면 `model.invoke`로 청크 폴백합니다. retrieve를 다시 돌리지 않습니다.
- **`ChatService`**: HTTP 어댑터. 409/410 사전 검사, SSE 매핑, abort, 성공 시 append.

답변 LLM 노드와 리라이트 LLM은 별개입니다. 리라이트 실패 폴백(ADR 0008)은 rewriter가 유지합니다.

## Consequences

- 파이프라인 추가 단계는 그래프 노드로 붙입니다.
- SSE 토큰 스트리밍은 여전히 LangChain `stream()`이며, 그래프 노드 스트리밍으로 바꾸지 않습니다.
