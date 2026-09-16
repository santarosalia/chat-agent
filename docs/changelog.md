# Changelog

- **v1.14** — `GET /dev/graph`가 채팅 LangGraph mermaid를 덤프한다. `NODE_ENV=production`이면 404.
- **v1.13** — retrieve 충분성 평가기를 분리한다 (ADR 0011). 검색·평가 이력을 들고 최대 3회 검색한다. `top_k`는 5 → 10 → 20. 평가기 `max_tokens` 200. 답변 LLM은 도구 없이 누적 citations로 답한다. 그래프는 `load_history → prepare → retrieve → evaluate → answer`이고 부족하면 retrieve로 돌아간다.
- **v1.12** — 매 턴 마지막 user 쿼리로 retrieve를 한 번 먼저 하고, 부족하면 `retrieve_documents`로 재검색한다 (ADR 0010).
- **v1.11** — 답변 LLM이 `retrieve_documents` 도구로 검색한다 (ADR 0010). `query`와 `top_k`를 모델이 고른다. 부족하면 `top_k`를 키워 최대 20번 다시 검색한다. 별도 리라이트는 쓰지 않는다. SSE는 도구 라운드 후 `meta`, 답변은 토큰 `stream()`.
- **v1.10** — 답변 LLM에 문서 근거 시스템 프롬프트를 넣음. retrieve 컨텍스트는 같은 system 메시지에 합쳐 맨 앞에 둔다.
- **v1.9** — citations에 retrieve `score`를 넣고, 테스트 UI 출처에 파일·페이지와 함께 표시.
- **v1.8** — 채팅 파이프라인을 LangGraph 노드로 이동 (ADR 0009). `ChatService`는 SSE·세션 검사·append만 담당.
- **v1.7** — retrieve 전 대화 기반 쿼리 리라이트 (ADR 0008). 첫 턴은 user 원문, 실패 시 마지막 user로 폴백.
- **v1.6** — `GET /sessions/:id`. `session_id`가 있으면 서버가 DB 대화를 LLM에 붙이고 요청 `messages`는 이번 user만 (ADR 0007). HTTP 액세스 로그와 LLM 입력 로그. `top_k`는 전체 코퍼스에도 적용.
- **v1.5.1** — Next.js 테스트 UI: `session_id`/`user_id` 입력, 새 세션·삭제(DELETE) 컨트롤, 409/410 오류 표시.
- **v1.5** — Append-only 채팅 기록: Prisma `chat_agent.messages`, `session_id`/`user_id` 선택 필드, `DELETE /sessions/:id` 소프트 삭제 (ADR 0006); 기록 persist/DB 오류는 best-effort(410·409만 클라이언트 노출).
