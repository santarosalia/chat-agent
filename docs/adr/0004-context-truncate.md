# ADR 0004: LLM 입력 컨텍스트 truncate (v1)

**Status:** Accepted  
**Date:** 2026-09-10

## Context

대화가 길어지면 LLM에 전달하는 메시지 목록이 컨텍스트 윈도를 초과할 수 있다. v1에서는 요약(summarization) 없이, 메시지 단위로 앞쪽을 잘라 LLM 입력 크기를 제한한다. RAG retrieve 쿼리는 truncate 대상이 아니며, truncate는 retrieve 및 RAG 컨텍스트 주입 **이후** LLM 입력에만 적용한다.

## Decision

- LLM 입력 메시지 상한 **N = 20** (메시지 개수 기준, 턴 수 아님). v1에서는 요청별 override 없음.
- **항상 유지:** 모든 `system` 메시지, RAG inject block(`[Retrieved context]`로 시작하는 retrieved context), **마지막 `user` 메시지**.
- 위 always-keep 집합을 제외한 나머지 메시지 중 **앞(오래된)쪽부터** 제거하여 총 개수 ≤ N.
- v1에서는 **중간 요약(summarization) 없음**.
- Retrieve query는 요청 `messages`의 **마지막 user 메시지 원문** 그대로 사용 (truncate 미적용; 리라이트·히스토리 합치기 금지 — [ADR 0001](./0001-contract-a-retrieve-only.md)).

## Consequences

- 긴 대화에서도 LLM 입력이 예측 가능한 상한(N)을 갖는다.
- 시스템 프롬프트, RAG 검색 결과, 최신 사용자 질문은 truncate로 잘리지 않는다.
- 오래된 user/assistant 턴은 우선 제거되어 최근 맥락이 남는다.
- always-keep 메시지만으로 N을 초과하면 v1에서는 추가 제거하지 않는다 (요약도 없음).
- retrieve 품질은 전체 대화가 아닌 마지막 user 메시지에 의존한다 (기존 동작 유지).
