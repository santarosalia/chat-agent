# chat-agent

**pnpm 모노레포**: NestJS API(`apps/api`) + Next.js 테스트 UI(`apps/web`). LangChain·LangGraph 기반 RAG 채팅 에이전트로, 외부 RAG에서 문서 스니펫을 선택적으로 검색해 LLM 프롬프트에 주입합니다.

## 패키지

| 패키지 | 설명 |
|--------|------|
| `apps/api` | `POST /chat` (JSON), `POST /chat/stream` (SSE), `GET /health` |
| `apps/web` | 로컬 API 테스트용 채팅 UI (로그인·히스토리 저장 없음) |

## 빠른 시작

```bash
# 루트에서 의존성 설치
pnpm install

# API 환경 변수
cp apps/api/.env.example apps/api/.env
# VLLM_*, RAG_BASE, CORS_ORIGIN 등 설정

# (선택) Web 환경 변수
cp apps/web/.env.example apps/web/.env.local

# API + Web 동시 실행
pnpm dev
```

- API: [http://localhost:3000](http://localhost:3000) (Swagger: [http://localhost:3000/docs](http://localhost:3000/docs))
- Web: [http://localhost:3001](http://localhost:3001)

개별 실행:

```bash
pnpm dev:api   # Nest watch, PORT 기본 3000
pnpm dev:web   # Next dev, 포트 3001
```

## 환경 변수

LLM 프로토콜은 OpenAI 호환을 유지하며, 설정용 환경 변수 이름만 `VLLM_*`(`VLLM_API_KEY`, `VLLM_BASE_URL`, `VLLM_MODEL`)입니다.

### API (`apps/api/.env`)

| 변수 | 설명 |
|------|------|
| `VLLM_API_KEY` | OpenAI 호환 LLM API 키 |
| `VLLM_BASE_URL` | LLM API 기본 URL |
| `VLLM_MODEL` | 모델 이름 (예: `gpt-4o-mini`) |
| `RAG_BASE` | RAG 검색 서비스 기본 URL |
| `PORT` | HTTP 포트 (기본 `3000`) |
| `CORS_ORIGIN` | 허용 Origin (기본 `http://localhost:3001`, 쉼표 구분) |

### Web (`apps/web/.env.local`)

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_API_URL` | API 기본 URL (기본 `http://localhost:3000`) |

## API 요약

### `POST /chat` (JSON, 비스트리밍)

기존 계약 유지. 응답: `message`, `rag_used`, 선택적 `citations`.

### `POST /chat/stream` (SSE)

동일 요청 본문. `text/event-stream` 이벤트: `meta` → `delta`* → `done` (오류 시 `error`). 스키마는 [ADR 0005](./docs/adr/0005-monorepo-and-sse.md) 참고.

### RAG

Contract A: `POST {RAG_BASE}/v1/retrieve`만 사용. 폴백·truncate는 [ADR 0003](./docs/adr/0003-rag-fallback.md), [ADR 0004](./docs/adr/0004-context-truncate.md).

## 개발

```bash
pnpm test          # API 단위 테스트
pnpm build         # api + web 빌드
pnpm start:api     # API 프로덕션 실행 (빌드 후)
```

## 프로젝트 구조

```
apps/
  api/src/
    chat/           # Controller, service, LangGraph, SSE, DTOs
    rag/            # Retrieve client, context injector
    health/
  web/
    app/            # Next.js test UI
    lib/            # API client
docs/adr/           # Architecture Decision Records
pnpm-workspace.yaml
```
