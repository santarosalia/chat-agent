# ADR 0007: 서버가 세션 대화를 조회해 LLM에 붙인다

**Status:** Accepted  
**Date:** 2026-09-11  
**Supersedes:** ADR 0006의 “조회/목록 API 없음”, “클라이언트는 요청 본문에 기존 턴을 실어 보낸다”

## Context

ADR 0006은 append-only 저장만 두고 조회 API를 두지 않았습니다. 테스트 UI와 호출자는 화면(또는 자체 메모리)의 전체 `messages`를 매 요청에 실어야 했고, LLM이 보는 대화는 DB가 아니라 클라이언트가 보낸 배열이었습니다. 세션을 진실 공급원으로 쓰려면 어긋납니다.

## Decision

### 요청 `messages`

- **`session_id`가 있으면** 요청 `messages`는 **이번 턴**(보통 마지막 `user` 하나)입니다. 서버는 저장된 user/assistant를 앞에 붙인 뒤 retrieve → inject → truncate → LLM을 실행합니다. 요청에 여분 히스토리가 있어도 **마지막 user만** 사용합니다.
- **`session_id`가 없으면** 기록 조회·저장을 건너뛰고, 요청 `messages`가 LLM 입력입니다(테스트 UI는 이번 user만 보내므로 멀티턴 맥락 없음).

retrieve 쿼리는 대화가 있으면 리라이트한 독립 질문입니다 ([ADR 0008](./0008-retrieve-query-rewrite.md)). 첫 턴은 이번 user 원문입니다.

### `GET /sessions/:id`

- 활성 턴을 `created_at` 오름차순으로 반환합니다: `{ session_id, user_id, messages }`.
- 행이 없으면 **404**. 소프트 삭제된 세션은 **410**.
- `chat_id`는 없습니다. 단위는 `session_id` + `messages` 행입니다.

### 파이프라인 (`POST /chat`, `POST /chat/stream`)

`session_id`가 있을 때: **append 가능 여부 검사 → DB 대화 로드 → (필요 시) retrieve 쿼리 리라이트 → retrieve → inject → truncate → LLM → 성공 시 이번 user+assistant append**.

삭제된 세션(410)·고정 `user_id` 불일치(409)는 기존 ADR 0006과 같습니다. 그 외 persist/로드 DB 오류는 best-effort(채팅은 계속, 기록만 건너뜀).

### 로그

요청마다 HTTP 한 줄(`method path status duration`, 선택 `session_id`/`user_id`/`group_id`/`top_k`). LLM 호출 직전(주입·truncate 이후) 모델·base URL·role/content를 남깁니다. 메시지 본문은 LLM 로그에만 있고 HTTP 로그에는 없습니다.

## Consequences

- 같은 `session_id`면 클라이언트가 전체 히스토리를 보내지 않아도 LLM 맥락이 일치합니다.
- `session_id` 없는 채팅은 이번 질문만 LLM에 갑니다.
- 스트림 abort 등 DB에 안 남은 턴은 다음 요청의 서버 맥락에 없습니다.
- ADR 0006의 테이블·append-only·소프트 삭제·`user_id` freeze는 그대로입니다.
