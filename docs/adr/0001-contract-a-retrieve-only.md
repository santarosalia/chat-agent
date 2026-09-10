# ADR 0001: Contract A — retrieve-only RAG integration

**Status:** Accepted  
**Date:** 2026-09-10

## Context

chat-agent integrates with an external RAG service (hybrid-rag). RAG can expose both retrieval (`POST /v1/retrieve`) and end-to-end query (`POST /v1/query`) endpoints. Using `/v1/query` would delegate the final answer LLM to RAG, creating two LLM calls and split ownership of citations and prompt assembly.

## Decision

chat-agent calls RAG **`POST /v1/retrieve` only**. Retrieved snippets are injected into the chat-agent prompt; the **final answer LLM always runs in chat-agent**. Delegating to RAG `/v1/query` is **out of scope** for v1 (Contract A).

## Consequences

- Single LLM boundary: chat-agent owns the assistant reply and `rag_used` / `citations` in the response.
- RAG remains a retrieval backend; no double-LLM latency or conflicting citation semantics.
- Future `/v1/query` support would require a new contract and ADR.
