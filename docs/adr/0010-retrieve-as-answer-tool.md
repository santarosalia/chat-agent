# ADR 0010: 답변 LLM이 retrieve를 도구로 호출한다

**Status:** Superseded by [ADR 0011](./0011-retrieve-sufficiency-evaluator.md)  
**Date:** 2026-09-15  
**Supersedes:** ADR 0008의 별도 리라이트 LLM. ADR 0009의 `rewrite → retrieve → prepare(inject)` 노드

## Context

항상 retrieve만 하면 TOC·키워드 밀집 청크가 `top_k`를 채운다. 검색을 모델에만 맡기면 후속 질문이 히스토리만 보고 retrieve를 건너뛰고, 문서를 검색한 것처럼 답한다. 별도 리라이트 LLM은 검색 질문만 고친다.

## Decision

매 턴 **마지막 user 원문**으로 retrieve를 **한 번 먼저** 하고, 그 결과를 `retrieve_documents` 도구 메시지로 답변 LLM에 넣습니다. 부족하면 모델이 같은 도구로 독립 `query`와 `top_k`를 골라 다시 검색합니다. Contract A(`POST /v1/retrieve`만)와 citations 소유권은 그대로입니다.

- **그래프:** `load_history → prepare(system+truncate) → llm`. llm 노드가 시드 retrieve 후 도구 루프를 돌립니다.
- **시드 retrieve:** 마지막 user 문장, 요청 `top_k`(기본 5). 모델이 도구를 호출하지 않아도 이 1회는 한다.
- **추가 호출:** `query`와 선택적 `top_k`를 모델이 고른다. `top_k`가 없거나 1 미만이면 요청 `top_k`(기본 5)로 폴백한다. 마지막 도구 결과의 citations가 `rag_used`/응답 citations이다. 컨텍스트는 `[Retrieved context]` inject가 아니라 tool 메시지로 간다.
- **라운드 상한** 시드 1회 + 모델 도구 20회. 결과가 부족하면 모델이 `top_k`를 키워 `retrieve_documents`를 다시 호출할 수 있다. 리라이트 전용 LLM은 채팅 경로에서 쓰지 않는다.
- **`POST /chat/stream`:** prepare 그래프 후 시드 retrieve와 도구 라운드는 `invoke`/`stream`으로 모으고, citations가 정해지면 `meta`를 보냅니다. 그다음 답변 턴은 `ChatOpenAI.stream()`으로 `delta`합니다. 스트림이 비거나 실패하면 `invoke` 결과를 청크로 폴백합니다.

## Consequences

- 후속 질문도 검색을 건너뛰지 않는다. 짧은 후속 문장의 첫 검색 품질은 떨어지고, 모델이 독립 `query`로 다시 검색해야 한다.
- 인사 등 문서가 필요 없는 턴에도 retrieve 지연이 있다.
- vLLM/Qwen이 추가 tool call 형식이 어긋나면 시드 결과만으로 답한다.
- SSE `delta`는 답변 턴의 토큰(또는 스트림 실패 시 청크)입니다. 도구 호출 중에는 `delta`를 보내지 않습니다. LLM이 `meta` 전에 실패하면 `error`로 끝납니다.
