# Changelog

- **v1.6** — `GET /sessions/:id`. `session_id`가 있으면 서버가 DB 대화를 LLM에 붙이고 요청 `messages`는 이번 user만 (ADR 0007). HTTP 액세스 로그와 LLM 입력 로그. `top_k`는 전체 코퍼스에도 적용.
- **v1.5.1** — Next.js 테스트 UI: `session_id`/`user_id` 입력, 새 세션·삭제(DELETE) 컨트롤, 409/410 오류 표시.
- **v1.5** — Append-only 채팅 기록: Prisma `chat_agent.messages`, `session_id`/`user_id` 선택 필드, `DELETE /sessions/:id` 소프트 삭제 (ADR 0006); 기록 persist/DB 오류는 best-effort(410·409만 클라이언트 노출).
