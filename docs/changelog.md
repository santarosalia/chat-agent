# Changelog

- **v1.5** — Append-only 채팅 기록: Prisma `chat_agent.messages`, `session_id`/`user_id` 선택 필드, `DELETE /sessions/:id` 소프트 삭제 (ADR 0006); 기록 persist/DB 오류는 best-effort(410·409만 클라이언트 노출).
