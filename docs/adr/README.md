# Architecture Decision Records (v1)

chat-agent v1 설계 결정을 담은 짧은 ADR 모음입니다.

| ADR | 제목 | Status |
|-----|------|--------|
| [0001](./0001-contract-a-retrieve-only.md) | Contract A — retrieve 전용 RAG 연동; v1 쿼리는 마지막 user 원문만 (리라이트는 v2) | Accepted |
| [0002](./0002-request-scoped-index-params.md) | 요청 범위 RAG 인덱스 파라미터 | Accepted |
| [0003](./0003-rag-fallback.md) | 실패 또는 빈 결과 시 RAG 폴백 | Accepted |
| [0004](./0004-context-truncate.md) | LLM 입력 컨텍스트 truncate (v1) | Accepted |
| [0005](./0005-monorepo-and-sse.md) | pnpm 모노레포 및 SSE 스트리밍 | Accepted |
| [0006](./0006-chat-history-append-only.md) | Append-only 채팅 기록 (v1.5). 조회 없음·클라이언트 전체 messages는 0007이 대체 | Accepted |
| [0007](./0007-server-owned-session-context.md) | 서버가 세션 대화를 조회해 LLM에 붙임; GET /sessions/:id | Accepted |
