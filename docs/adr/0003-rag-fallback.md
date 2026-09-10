# ADR 0003: 실패 또는 빈 결과 시 RAG 폴백

**Status:** Accepted  
**Date:** 2026-09-10

## Context

RAG 검색은 선택적 보강(enrichment)입니다. RAG 서비스가 느리거나 사용 불가능하거나 관련 청크를 반환하지 않을 수 있습니다. chat-agent는 검색이 성공하지 않을 때도 사용 가능해야 하며 예측 가능하게 응답해야 합니다.

## Decision

RAG 검색은 **5초 타임아웃**과 **재시도 없음**을 사용합니다. **빈 citations**, **타임아웃**, **비 2xx RAG 응답(4xx 및 5xx)** 시 chat-agent는 **RAG를 건너뛰고** 자체 LLM만으로 답변합니다.

응답은 **`rag_used: false`**로 설정하고 **`citations`를 생략**합니다.

## Consequences

- RAG가 다운되거나 느릴 때도 채팅은 사용 가능하며, 최악의 경우 검색된 컨텍스트 없이 답변합니다.
- 실패하는 RAG 의존성에 대한 재시도 폭주나 긴 대기가 없습니다.
- 클라이언트는 `rag_used`로 인용 적용 여부를 판단할 수 있으며, `rag_used`가 false일 때 `citations`가 없는 것은 의도된 동작입니다.
