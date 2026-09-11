# ADR 0008: retrieve 전 대화 기반 쿼리 리라이트

**Status:** Accepted  
**Date:** 2026-09-11  
**Supersedes:** ADR 0001의 “retrieve 쿼리는 마지막 user 원문만, 리라이트 금지”

## Context

멀티턴에서 마지막 user만 retrieve하면 “그거”, “며칠이야” 같은 지시어가 hybrid(dense/sparse) 검색과 안 맞습니다. assistant가 가리키는 대상을 풀려면 최근 대화가 필요하고, 그 본문을 retrieve `query`에 그대로 넣으면 오답 청크가 다음 검색을 오염시킵니다.

## Decision

**DB 대화 로드 후, retrieve 전에** chat-agent가 검색 쿼리만 리라이트합니다. 답변은 계속 chat-agent LLM이며 RAG `/v1/query`에 위임하지 않습니다 (Contract A 유지).

- **입력:** 로드된 대화의 최근 최대 6턴(user+assistant). assistant는 검색 문자열이 아니라 리라이트 맥락이며, 길면 앞 400자만 넣습니다.
- **출력:** 독립 검색 질문 **한 줄**. 이 문자열만 RAG `POST /v1/retrieve`의 `query`입니다.
- **첫 턴**(이전 대화 없음): 리라이트 LLM을 호출하지 않고 이번 user 원문을 그대로 검색합니다.
- **실패:** 리라이트 LLM 오류·빈 출력이면 마지막 user 원문으로 폴백하고 채팅은 계속합니다.

답변용 `messages`는 리라이트하지 않습니다. retrieve 결과 inject → truncate → 답변 LLM은 기존과 같습니다.

## Consequences

- 후속 질문의 hybrid 검색 품질이 좋아집니다. 요청당 LLM이 최대 한 번 더 돕니다.
- 리라이트가 빗나가면 잘못된 청크를 가져올 수 있어, 로그에 original/rewritten을 남깁니다.
- ADR 0001의 retrieve-only·답변 LLM 소유권은 그대로입니다.
