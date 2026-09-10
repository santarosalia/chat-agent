# chat-agent

RAG-backed chat agent built with **NestJS**, **LangChain**, and **LangGraph**. Exposes a non-streaming JSON `POST /chat` endpoint that optionally retrieves document snippets from an external RAG service and injects them into the LLM prompt.

## Features

- `POST /chat` — chat with optional RAG retrieval and citations
- `GET /health` — liveness check
- OpenAI-compatible LLM via environment variables
- Graceful RAG fallback (timeout, 4xx/5xx, empty results → answer without RAG)
- Unit tests for retrieve client, context injection, and chat service

## Quick start

```bash
cp .env.example .env
# Edit .env with your LLM and RAG settings

npm install
npm run start:dev
```

The server listens on `PORT` (default `3000`).

Interactive OpenAPI docs are at [http://localhost:3000/docs](http://localhost:3000/docs) while the app is running.

## Environment variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for the OpenAI-compatible LLM |
| `OPENAI_BASE_URL` | Base URL for the LLM API (e.g. `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Model name (e.g. `gpt-4o-mini`) |
| `RAG_BASE` | Base URL of the RAG retrieval service |
| `PORT` | HTTP port (default `3000`) |

## API

### `GET /health`

```json
{ "status": "ok" }
```

### `POST /chat`

**Request**

```json
{
  "messages": [
    { "role": "user", "content": "What is in the handbook?" }
  ],
  "group_id": "hr-docs",
  "top_k": 5
}
```

`group_id` is required. `top_k` is optional and defaults to `5` when omitted.

**Response (RAG used)**

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

**Response (RAG not used)**

```json
{
  "message": {
    "role": "assistant",
    "content": "I can help with that..."
  },
  "rag_used": false
}
```

When `rag_used` is `false`, `citations` is omitted.

## RAG integration

RAG uses `POST /v1/retrieve` only; the final answer LLM runs in chat-agent. Delegating to RAG `/v1/query` is out of scope (contract A).

For each chat request, the service uses the **content of the last `user` message** as the retrieval query.

It calls:

```
POST {RAG_BASE}/v1/retrieve
```

```json
{
  "query": "<last user message>",
  "mode": "hybrid",
  "group_id": "<request group_id>",
  "top_k": "<request top_k or 5>",
  "rerank": true,
  "snippet": true,
  "content": false
}
```

- Timeout: **5 seconds**, no retries
- On empty results, timeout, or RAG 4xx/5xx: answers without RAG (`rag_used: false`)

When retrieval succeeds, context is injected **before the first system message** (or prepended if none exists):

```
[Retrieved context]
- (filename.pdf p.1) snippet text
- (other.pdf p.4) another snippet
```

## Architecture

```
POST /chat
  → extract last user message (retrieve query)
  → RagRetrieveClient → POST {RAG_BASE}/v1/retrieve
  → injectRetrievedContext (if hits)
  → LangGraph (single LLM node) → OpenAI-compatible model
  → JSON response with message, rag_used, citations
```

## Development

```bash
npm run build
npm test
npm run start:prod
```

## Project layout

```
src/
  chat/           # Controller, service, LangGraph, DTOs
  rag/            # Retrieve client, context injector
  health/         # Health check
  app.module.ts
  main.ts
```
