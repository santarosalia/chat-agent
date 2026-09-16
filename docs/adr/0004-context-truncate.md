# ADR 0004: LLM 입력 컨텍스트 truncate (v1)

**Status:** Accepted  
**Date:** 2026-09-10

## Context

대화가 길어지면 LLM에 전달하는 메시지 목록이 컨텍스트 윈도를 초과할 수 있다. v1에서는 요약(summarization) 없이, 메시지 단위로 앞쪽을 잘라 LLM 입력 크기를 제한한다. RAG retrieve 쿼리는 truncate 대상이 아니며, truncate는 답변 LLM 첫 호출 **이전** 대화(시스템 프롬프트 포함)에만 적용한다. retrieve 결과는 truncate 후 system에 `[Retrieved context]`로 붙인다 ([ADR 0011](./0011-retrieve-sufficiency-evaluator.md)).

## Decision

- LLM 입력 메시지 상한 **N = 20** (메시지 개수 기준, 턴 수 아님). v1에서는 요청별 override 없음.
- **항상 유지:** 모든 `system` 메시지, **마지막 `user` 메시지**. (retrieve 결과는 prepare truncate 대상이 아니다.)
- 위 always-keep 집합을 제외한 나머지 메시지 중 **앞(오래된)쪽부터** 제거하여 총 개수 ≤ N.
- v1에서는 **중간 요약(summarization) 없음**.
- Retrieve query 첫 검색은 마지막 user 원문이고, 추가 검색은 평가기 `missing`이다 ([ADR 0011](./0011-retrieve-sufficiency-evaluator.md)). truncate는 retrieve 쿼리가 아니라 LLM 입력에만 적용한다.

## Consequences

- 긴 대화에서도 LLM 입력이 예측 가능한 상한(N)을 갖는다.
- 시스템 프롬프트, RAG 검색 결과, 최신 사용자 질문은 truncate로 잘리지 않는다.
- 오래된 user/assistant 턴은 우선 제거되어 최근 맥락이 남는다.
- always-keep 메시지만으로 N을 초과하면 v1에서는 추가 제거하지 않는다 (요약도 없음).
- retrieve 품질은 시드 쿼리(마지막 user)와 평가기 `missing`에 의존한다 ([ADR 0011](./0011-retrieve-sufficiency-evaluator.md)).
