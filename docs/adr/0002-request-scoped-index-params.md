# ADR 0002: Request-scoped RAG index parameters

**Status:** Accepted  
**Date:** 2026-09-10

## Context

RAG retrieval is scoped by document group (`group_id`) and result count (`top_k`). These vary per tenant or request. Storing them in environment variables (`RAG_GROUP_ID`, `RAG_TOP_K`) couples deployment config to index selection and prevents multi-tenant or per-request routing without redeploying.

## Decision

On **`POST /chat`**, index parameters are **request-scoped**:

- **`group_id`**: required string in the request body
- **`top_k`**: optional number; default **5** when omitted

Remove `RAG_GROUP_ID` and `RAG_TOP_K` from environment configuration. **`RAG_BASE`** remains an env variable (infrastructure / service URL only).

## Consequences

- Callers must supply `group_id`; validation rejects requests without it.
- Operators configure only where RAG lives (`RAG_BASE`), not which index each chat uses.
- Retrieve calls pass `group_id` and `top_k` from the incoming chat request.
