# ADR 0005: pnpm 모노레포 및 SSE 스트리밍

**Status:** Accepted  
**Date:** 2026-09-10

## Context

chat-agent는 NestJS API 단일 패키지로 시작했으며, `POST /chat` JSON 응답만 제공했습니다. 로컬에서 RAG·스트리밍·인용 동작을 빠르게 검증할 테스트 UI가 필요하고, LLM 토큰 단위 응답을 클라이언트에 전달하는 SSE 엔드포인트가 요구됩니다. 기존 Contract A(retrieve 전용), ADR 0004 truncate, `VLLM_*` 환경 변수, RAG 폴백(ADR 0003)은 유지해야 합니다.

## Decision

### 모노레포 레이아웃

pnpm workspace로 재구성합니다.

| 경로 | 역할 |
|------|------|
| `apps/api` | 기존 Nest chat-agent (`POST /chat`, `POST /chat/stream`, `GET /health`) |
| `apps/web` | Next.js **테스트 전용** 채팅 UI (로그인·DB 세션·히스토리 영속 없음) |
| `docs/adr` | 설계 결정 (한국어 본문 유지) |

루트 `package.json`은 `pnpm dev`, `pnpm test` 등 공통 스크립트를 제공합니다.

### `POST /chat` vs `POST /chat/stream`

- **`POST /chat`**: 기존과 동일한 **비스트리밍 JSON** 계약 (`message`, `rag_used`, 선택적 `citations`). 변경 없음.
- **`POST /chat/stream`**: `Content-Type: text/event-stream`. 요청 본문은 `/chat`과 동일(`ChatRequestDto`).
- 두 엔드포인트 모두 동일 파이프라인: **retrieve → inject → truncate(ADR 0004) → LLM**.
- RAG 폴백(빈 결과·타임아웃·4xx/5xx) 시 `rag_used: false`, `citations` 생략 — 스트림의 `meta`/`done`에도 동일하게 반영.

### SSE 이벤트 스키마

각 이벤트는 `event:` + `data:` (JSON 한 줄) 형식입니다.

| event | data | 설명 |
|-------|------|------|
| `meta` | `{ "rag_used": boolean, "citations"?: [...] }` | RAG 결과 메타. LLM 토큰 전송 **전** 1회. 폴백 시 `rag_used: false`, citations 없음. |
| `delta` | `{ "content": string }` | assistant 텍스트 조각(토큰 또는 청크). |
| `done` | `{ "message": { "role":"assistant", "content": string }, "rag_used": boolean, "citations"?: [...] }` | 최종 전체 응답. `/chat` JSON의 `message`/`rag_used`/`citations`와 동일 의미. |
| `error` | `{ "message": string }` | 스트림 처리 중 런타임 오류. (요청 유효성 400은 일반 JSON HTTP 응답.) |

예시:

```
event: meta
data: {"rag_used":true,"citations":[{"filename":"a.pdf","page":1,"snippet":"..."}]}

event: delta
data: {"content":"안녕"}

event: done
data: {"message":{"role":"assistant","content":"안녕하세요"},"rag_used":true,"citations":[...]}
```

### LLM 스트리밍 정직성

- **1순위**: LangChain `ChatOpenAI.stream()`으로 OpenAI 호환 서버의 토큰/청크를 `delta`로 전달.
- **폴백**: 스트림 API 실패 또는 빈 스트림 시 LangGraph 단일 LLM 노드(`invoke`) 결과를 고정 크기 청크로 나눠 `delta`를 emit한 뒤 `done` — **토큰 단위가 아닌 청크 스트리밍**임을 클라이언트는 인지해야 함.
- LangGraph 경로 자체는 v1에서 스트리밍 노드로 확장하지 않음.

### 테스트 전용 프론트엔드 (`apps/web`)

- 인증 없음, 서버/클라이언트 채팅 히스토리 DB 없음.
- 입력: user 메시지, 선택 `group_id`, 선택 `top_k`, stream / non-stream 토글.
- 출력: assistant 텍스트, `rag_used` 배지, citations 목록.
- `NEXT_PUBLIC_API_URL`(기본 `http://localhost:3000`)로 API 호출.

### CORS

API는 **`CORS_ORIGIN`**(기본 `http://localhost:3001`, 쉼표 구분 복수 가능)에 대해서만 CORS를 허용합니다. Next 테스트 UI(`apps/web`, 포트 3001) 전용입니다.

## Consequences

- 단일 repo에서 API·테스트 UI를 함께 개발·실행할 수 있습니다.
- `/chat` JSON 클라이언트는 영향 없이 SSE 소비자를 추가할 수 있습니다.
- 스트림 소비자는 `meta`로 RAG 상태를 먼저 받고, `delta`로 UX를 개선하며, `done`으로 최종 계약 필드를 확인합니다.
- LLM 스트림 불가 환경에서는 청크 폴백으로 동작하지만 실시간성은 제한될 수 있습니다(문서화됨).
- 프로덕션 프론트·인증·세션 저장은 v1 범위 밖입니다.
