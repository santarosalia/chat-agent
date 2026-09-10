# chat-agent

**NestJS**, **LangChain**, **LangGraph**로 구축된 RAG 기반 채팅 에이전트입니다. 외부 RAG 서비스에서 문서 스니펫을 선택적으로 검색해 LLM 프롬프트에 주입하는 비스트리밍 JSON `POST /chat` 엔드포인트를 제공합니다.

## 기능

- `POST /chat` — 선택적 RAG 검색 및 인용(citations)이 포함된 채팅
- `GET /health` — 생존(liveness) 확인
- 환경 변수를 통한 OpenAI 호환 LLM 연동
- RAG 폴백 (타임아웃, 4xx/5xx, 빈 결과 → RAG 없이 응답)
- retrieve 클라이언트, 컨텍스트 주입, 채팅 서비스 단위 테스트

## 빠른 시작

```bash
cp .env.example .env
# LLM 및 RAG 설정을 .env에 입력하세요

npm install
npm run start:dev
```

서버는 `PORT`(기본값 `3000`)에서 수신 대기합니다.

앱 실행 중 [http://localhost:3000/docs](http://localhost:3000/docs)에서 대화형 OpenAPI 문서를 확인할 수 있습니다.

## 환경 변수

LLM 프로토콜은 OpenAI 호환을 유지하며, 설정용 환경 변수 이름만 `VLLM_*`(`VLLM_API_KEY`, `VLLM_BASE_URL`, `VLLM_MODEL`)입니다.

| 변수 | 설명 |
|------|------|
| `VLLM_API_KEY` | OpenAI 호환 LLM API 키 |
| `VLLM_BASE_URL` | LLM API 기본 URL (예: `https://api.openai.com/v1`) |
| `VLLM_MODEL` | 모델 이름 (예: `gpt-4o-mini`) |
| `RAG_BASE` | RAG 검색 서비스 기본 URL |
| `PORT` | HTTP 포트 (기본값 `3000`) |

## API

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /chat`

**요청**

```json
{
  "messages": [
    { "role": "user", "content": "What is in the handbook?" }
  ],
  "group_id": "hr-docs",
  "top_k": 5
}
```

`group_id`는 선택 사항입니다. 생략하면 전체 문서를 검색합니다(`group_id`는 retrieve 요청에 포함되지 않음). `top_k`도 선택 사항이며, 생략 시 기본값은 `5`입니다.

**응답 (RAG 사용)**

```json
{
  "message": {
    "role": "assistant",
    "content": "According to the handbook..."
  },
  "rag_used": true,
  "citations": [
    {
      "filename": "handbook.pdf",
      "page": 3,
      "snippet": "Relevant excerpt..."
    }
  ]
}
```

**응답 (RAG 미사용)**

```json
{
  "message": {
    "role": "assistant",
    "content": "I can help with that..."
  },
  "rag_used": false
}
```

`rag_used`가 `false`이면 `citations`는 생략됩니다.

## RAG 연동

RAG는 `POST /v1/retrieve`만 사용합니다. 최종 답변 LLM은 chat-agent에서 실행됩니다. RAG `/v1/query`에 위임하는 것은 범위 밖입니다(Contract A).

각 채팅 요청에서 **마지막 `user` 메시지의 content**를 검색 쿼리로 사용합니다.

다음 엔드포인트를 호출합니다:

```
POST {RAG_BASE}/v1/retrieve
```

```json
{
  "query": "<last user message>",
  "mode": "hybrid",
  "top_k": "<request top_k or 5>",
  "rerank": true,
  "snippet": true,
  "content": false
}
```

채팅 요청에 `group_id`가 포함되면 retrieve 본문에 추가됩니다. 그렇지 않으면 해당 필드는 생략됩니다(전체 코퍼스 검색).

- 타임아웃: **5초**, 재시도 없음
- 빈 결과, 타임아웃, RAG 4xx/5xx 시: RAG 없이 응답 (`rag_used: false`)

검색이 성공하면 컨텍스트가 **첫 번째 system 메시지 앞**에 주입됩니다(system 메시지가 없으면 맨 앞에 추가):

```
[Retrieved context]
- (filename.pdf p.1) snippet text
- (other.pdf p.4) another snippet
```

## 아키텍처

```
POST /chat
  → extract last user message (retrieve query)
  → RagRetrieveClient → POST {RAG_BASE}/v1/retrieve
  → injectRetrievedContext (if hits)
  → LangGraph (single LLM node) → OpenAI-compatible model
  → JSON response with message, rag_used, citations
```

## 개발

```bash
npm run build
npm test
npm run start:prod
```

## 프로젝트 구조

```
src/
  chat/           # Controller, service, LangGraph, DTOs
  rag/            # Retrieve client, context injector
  health/         # Health check
  app.module.ts
  main.ts
```
