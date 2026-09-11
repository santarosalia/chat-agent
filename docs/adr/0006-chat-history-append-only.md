# ADR 0006: Append-only 채팅 기록 (v1.5)

**Status:** Accepted (기록 모델). **조회 없음**과 **클라이언트가 기존 턴을 요청에 실어 보낸다**는 [ADR 0007](./0007-server-owned-session-context.md)에서 대체.  
**Date:** 2026-09-10

## Context

chat-agent API는 v1에서 RAG·스트리밍 채팅만 제공했고 서버 측 대화 기록 영속화는 없었습니다. v1.5에서는 **append-only** 방식으로 Postgres에 user/assistant 턴만 저장해, 이후 버전의 히스토리 조회·분석·감사에 기반을 마련합니다. RAG 데이터는 Contract A대로 **RAG_BASE HTTP API 전용**이며, Prisma/DB에는 RAG 테이블을 두지 않습니다.

## Decision

### Postgres 스키마 `chat_agent` (Prisma 전용)

- 동일 Postgres 인스턴스(`DATABASE_URL`)를 RAG와 공유할 수 있으나, **Prisma가 관리하는 스키마는 `chat_agent`만** 사용합니다.
- RAG 사용자/문서 테이블에 FK를 두지 않습니다.

### 테이블 `messages` (단일 테이블, sessions/chats 테이블 없음)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | UUID PK | |
| `session_id` | UUID NOT NULL | 클라이언트 생성 |
| `user_id` | TEXT NULL | 선택 문자열, FK 없음 |
| `role` | TEXT NOT NULL | CHECK: `user` \| `assistant` |
| `content` | TEXT NOT NULL | |
| `rag_used` | BOOLEAN NULL | assistant 전용 |
| `citations` | JSONB NULL | assistant 전용 |
| `created_at` | TIMESTAMPTZ NOT NULL | |
| `deleted_at` | TIMESTAMPTZ NULL | 세션 소프트 삭제 시 해당 `session_id` 전체 행에 설정 |

**인덱스:** `(session_id, created_at)`, `(user_id, session_id, created_at)`

Prisma `_prisma_migrations`는 multi-schema 설정으로 `chat_agent` 스키마에 둡니다.

### Append-only 동작

- ~~**조회/목록 API 없음** (v1.5).~~ → `GET /sessions/:id` 및 LLM 조합은 [ADR 0007](./0007-server-owned-session-context.md).
- 클라이언트가 `session_id`(UUID)를 생성·전달합니다. 서버는 session ID를 발급하지 않습니다.
- `session_id` **생략** 시 채팅은 정상 동작하되 **기록 조회·영속화를 건너뜁니다**.
- **system 메시지·RAG inject 블록은 저장하지 않습니다.** 성공 응답 후 **마지막 user 턴 + assistant 턴**만 append합니다.
- `POST /chat`: 성공 응답 후 append.
- `POST /chat/stream`: **`done` 이벤트까지 성공한 경우에만** append (abort/error → skip).

### TTL

- 환경 변수 `CHAT_HISTORY_TTL_DAYS` (기본 **30**).
- 만료는 **배치/cron 삭제**로 처리합니다. **요청 경로에서 live GC를 수행하지 않습니다.**
- v1.5에서는 cron wiring stub/문서화만 포함합니다.

### 소프트 삭제

- `DELETE /sessions/:id` — `:id`는 `session_id`.
- 해당 `session_id`의 **모든** 행에 `deleted_at` 설정.
- **항상 HTTP 204** (존재하지 않는 id, 이미 삭제된 id 포함). 404를 반환하지 않아 **미인증 API에서 존재 여부를 노출하지 않습니다**.

### 삭제 후 append

- 해당 `session_id`에 `deleted_at IS NOT NULL`인 행이 **하나라도** 있으면 append 시 **410 Gone**.

### `user_id` (선택)

- 없으면 `session_id`만으로 append/410/TTL 동작.
- **첫 append 시 `user_id`가 있으면** 세션에 **고정(freeze)**.
- 이후 요청에서 `user_id` 생략 또는 다른 값 → **409 Conflict**.
- 소프트 삭제 후에는 session 범위 **410** (변경 없음).

## Consequences

- 서버는 대화를 append만 합니다. v1.5에서는 클라이언트가 기존 턴을 요청에 실어야 했으나, 그 계약은 [ADR 0007](./0007-server-owned-session-context.md)에서 서버 조회로 바뀌었습니다.
- `apps/api`에 Prisma·Postgres 의존성이 추가됩니다. `DATABASE_URL` 미설정 시 앱 기동 시 Prisma 연결 실패 가능 — 운영 환경에서 마이그레이션·URL 설정 필요.
- RAG Contract A 유지: retrieve는 HTTP만, Prisma에 RAG 모델 없음.
- TTL cron은 후속 작업으로 wiring합니다.

## 후속 (TTL cron stub)

```typescript
// 예: @nestjs/schedule — CHAT_HISTORY_TTL_DAYS 기준 created_at < now() - TTL 일괄 DELETE
// v1.5 범위: ADR 문서화만, 요청 핸들러에 GC 로직 없음
```
