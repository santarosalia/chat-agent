# ADR 0003: RAG fallback on failure or empty results

**Status:** Accepted  
**Date:** 2026-09-10

## Context

RAG retrieval is optional enrichment. The RAG service may be slow, unavailable, or return no relevant chunks. chat-agent must remain usable and respond predictably when retrieval does not succeed.

## Decision

RAG retrieval uses a **5 second timeout** with **no retries**. On **empty citations**, **timeout**, or **non-2xx RAG responses (4xx and 5xx)**, chat-agent **skips RAG** and answers with its own LLM only.

The response sets **`rag_used: false`** and **omits `citations`**.

## Consequences

- Chat remains available when RAG is down or slow; worst case is an answer without retrieved context.
- No retry storms or long hangs on a failing RAG dependency.
- Clients can rely on `rag_used` to know whether citations apply; absence of `citations` when `rag_used` is false is intentional.
