# ADR 0001: Contract A — retrieve 전용 RAG 연동

**Status:** Accepted  
**Date:** 2026-09-10

## Context

chat-agent는 외부 RAG 서비스(hybrid-rag)와 연동합니다. RAG는 검색(`POST /v1/retrieve`)과 end-to-end 쿼리(`POST /v1/query`) 엔드포인트를 모두 제공할 수 있습니다. `/v1/query`를 사용하면 최종 답변 LLM이 RAG에 위임되어 LLM 호출이 두 번 발생하고, 인용(citations) 및 프롬프트 조립의 소유권이 분리됩니다.

## Decision

chat-agent는 RAG **`POST /v1/retrieve`만** 호출합니다. 검색된 스니펫은 chat-agent 프롬프트에 주입되며, **최종 답변 LLM은 항상 chat-agent에서 실행**됩니다. RAG `/v1/query`에 위임하는 것은 v1에서 **범위 밖**입니다(Contract A).

## Consequences

- 단일 LLM 경계: chat-agent가 assistant 응답과 `rag_used` / `citations`를 응답에서 소유합니다.
- RAG는 검색 백엔드로 유지되며, 이중 LLM 지연 또는 충돌하는 인용 의미론이 없습니다.
- 향후 `/v1/query` 지원은 새 계약과 ADR이 필요합니다.
