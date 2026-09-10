# ADR 0002: Request-scoped RAG index parameters

**Status:** Accepted  
**Date:** 2026-09-10

## Context

RAG retrieval is scoped by document group (`group_id`) and result count (`top_k`). These vary per tenant or request. Storing them in environment variables (`RAG_GROUP_ID`, `RAG_TOP_K`) couples deployment config to index selection and prevents multi-tenant or per-request routing without redeploying.

## Decision

On **`POST /chat`**, index parameters are **request-scoped**:

- **`group_id`**: optional string; when omitted, search **all documents** and **do not send `group_id`** in the retrieve request body
- **`top_k`**: optional number; default **5** when omitted

Remove `RAG_GROUP_ID` and `RAG_TOP_K` from environment configuration. **`RAG_BASE`** remains an env variable (infrastructure / service URL only).

## Consequences

- Callers may omit `group_id` for whole-corpus retrieval; when provided, it is passed through to RAG.
- Operators configure only where RAG lives (`RAG_BASE`), not which index each chat uses.
- Retrieve calls include `top_k` from the request (or default 5) and include `group_id` only when the chat request supplies it.
