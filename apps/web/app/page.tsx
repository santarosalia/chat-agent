'use client';

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ChatApiError,
  deleteSession,
  postChat,
  postChatStream,
} from '@/lib/chat-api';
import {
  buildChatRequest,
  ThreadMessage,
} from '@/lib/chat-thread';
import { MarkdownBody } from '@/lib/markdown-body';

const PROMPTS = [
  '직원 핸드북에는 무엇이 있나요?',
  '연차는 며칠인가요?',
  '검색 없이 일반적인 답변을 해줘',
];

function createId(): string {
  return crypto.randomUUID();
}

export default function HomePage() {
  const [userInput, setUserInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [topK, setTopK] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [userId, setUserId] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
  const [useStream, setUseStream] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  function patchMessage(id: string, patch: Partial<ThreadMessage>) {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id ? { ...message, ...patch } : message,
      ),
    );
  }

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 136)}px`;
  }

  function resetConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setLoading(false);
    setUserInput('');
    requestAnimationFrame(resizeTextarea);
  }

  async function sendMessage(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || loading) {
      return;
    }

    const userMessage: ThreadMessage = {
      id: createId(),
      role: 'user',
      content: trimmed,
    };
    const assistantId = createId();
    const history = [...messages, userMessage];
    const body = buildChatRequest(history, {
      groupId,
      topK,
      sessionId,
      userId,
    });

    setUserInput('');
    setMessages([
      ...history,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);
    requestAnimationFrame(resizeTextarea);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (useStream) {
        await postChatStream(
          body,
          {
            onMeta: (meta) => {
              patchMessage(assistantId, {
                ragUsed: meta.rag_used,
                citations: meta.citations ?? [],
              });
            },
            onDelta: (content) => {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + content }
                    : message,
                ),
              );
            },
            onDone: (data) => {
              patchMessage(assistantId, {
                streaming: false,
                ...(data.message?.content
                  ? { content: data.message.content }
                  : {}),
              });
            },
            onError: (message) => {
              patchMessage(assistantId, {
                streaming: false,
                error: message,
              });
            },
          },
          controller.signal,
        );
      } else {
        const response = await postChat(body, controller.signal);
        patchMessage(assistantId, {
          streaming: false,
          content: response.message.content,
          ragUsed: response.rag_used,
          citations: response.citations ?? [],
        });
      }
    } catch (submitError) {
      if (controller.signal.aborted) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (
            last?.id === assistantId &&
            last.role === 'assistant' &&
            last.content.length === 0
          ) {
            return prev.slice(0, -1);
          }
          return prev.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false }
              : message,
          );
        });
      } else {
        const message =
          submitError instanceof ChatApiError
            ? submitError.message
            : submitError instanceof Error
              ? submitError.message
              : '요청에 실패했습니다.';
        patchMessage(assistantId, {
          streaming: false,
          error: message,
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId && message.streaming
            ? { ...message, streaming: false }
            : message,
        ),
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(userInput);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(userInput);
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  function startNewSession() {
    setSessionId(createId());
    setDeleteStatus(null);
  }

  function clearSessionId() {
    setSessionId('');
    setDeleteStatus(null);
  }

  async function handleDeleteSession() {
    const id = sessionId.trim();
    if (!id || deletingSession) {
      return;
    }

    setDeletingSession(true);
    setDeleteStatus(null);

    try {
      const status = await deleteSession(id);
      setDeleteStatus(
        status === 204
          ? `DELETE /sessions/${id} → HTTP ${status} (세션 ID 유지 — 다음 전송 시 410 확인 가능)`
          : `DELETE /sessions/${id} → HTTP ${status}`,
      );
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : '세션 삭제 요청에 실패했습니다.';
      setDeleteStatus(message);
    } finally {
      setDeletingSession(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>chat-agent</h1>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="ghost"
            aria-pressed={showSettings}
            onClick={() => setShowSettings((open) => !open)}
          >
            검색 범위
          </button>
          <button
            type="button"
            className="ghost"
            onClick={resetConversation}
            disabled={messages.length === 0 && !loading}
          >
            새 대화
          </button>
        </div>
      </header>

      <div className="thread" ref={threadRef} role="log">
        {messages.length === 0 ? (
          <div className="empty">
            <h2>문서에 물어보세요</h2>
            <p>
              질문은 대화로 이어집니다. 답변 아래 카드가 검색된 스니펫입니다.
            </p>
            <div className="prompts">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setUserInput(prompt);
                    textareaRef.current?.focus();
                    requestAnimationFrame(resizeTextarea);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div className="turn user" key={message.id}>
                <div className="bubble">{message.content}</div>
              </div>
            ) : (
              <div className="turn assistant" key={message.id}>
                <div className="assistant-stack">
                  {message.ragUsed !== undefined && (
                    <div className="meta-row">
                      <span
                        className={`badge ${message.ragUsed ? 'on' : 'off'}`}
                      >
                        {message.ragUsed ? 'RAG' : 'RAG 없음'}
                      </span>
                    </div>
                  )}
                  <div
                    className={`bubble${message.error ? ' error-text' : ''}`}
                  >
                    {message.error ? (
                      message.error
                    ) : message.content ? (
                      <MarkdownBody>{message.content}</MarkdownBody>
                    ) : null}
                    {message.streaming && <span className="caret" />}
                  </div>
                  {message.citations && message.citations.length > 0 && (
                    <details className="citations-block">
                      <summary>
                        <span className="cite-count">
                          출처 {message.citations.length}
                        </span>
                        <span className="cite-names">
                          {message.citations
                            .map(
                              (citation) =>
                                `${citation.filename} p.${citation.page}`,
                            )
                            .join(' · ')}
                        </span>
                      </summary>
                      <ol className="citations">
                        {message.citations.map((citation, index) => (
                          <li
                            key={`${citation.filename}-${citation.page}-${index}`}
                          >
                            <div className="cite-tab">
                              {citation.filename} · p.{citation.page}
                            </div>
                            <div className="cite-snippet">
                              {citation.snippet}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      <form className="dock" onSubmit={handleSubmit}>
        {showSettings && (
          <>
            <div className="settings">
              <div className="field">
                <label htmlFor="group-id">group_id</label>
                <input
                  id="group-id"
                  type="text"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  placeholder="전체 코퍼스"
                />
              </div>
              <div className="field">
                <label htmlFor="top-k">top_k</label>
                <input
                  id="top-k"
                  type="number"
                  min={1}
                  value={topK}
                  onChange={(event) => setTopK(event.target.value)}
                  placeholder="5"
                />
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={useStream}
                  onChange={(event) => setUseStream(event.target.checked)}
                />
                스트림
              </label>
            </div>
            <div className="settings history-settings">
              <div className="field session-field">
                <label htmlFor="session-id">session_id</label>
                <input
                  id="session-id"
                  type="text"
                  value={sessionId}
                  onChange={(event) => {
                    setSessionId(event.target.value);
                    setDeleteStatus(null);
                  }}
                  placeholder="비우면 기록 없음"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label htmlFor="user-id">user_id</label>
                <input
                  id="user-id"
                  type="text"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="선택"
                />
              </div>
              <div className="session-actions">
                <button type="button" className="ghost" onClick={startNewSession}>
                  새 세션
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={clearSessionId}
                  disabled={!sessionId}
                >
                  세션 비우기
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => void handleDeleteSession()}
                  disabled={!sessionId.trim() || deletingSession}
                >
                  {deletingSession ? '삭제 중…' : '세션 삭제'}
                </button>
              </div>
            </div>
            {deleteStatus && (
              <p className="session-status" role="status">
                {deleteStatus}
              </p>
            )}
          </>
        )}

        <div className="composer">
          <textarea
            ref={textareaRef}
            id="message"
            value={userInput}
            onChange={(event) => {
              setUserInput(event.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder="메시지 입력"
            rows={1}
            aria-label="메시지"
          />
          {loading ? (
            <button type="button" className="send" onClick={stopGenerating}>
              중지
            </button>
          ) : (
            <button type="submit" className="send" disabled={!userInput.trim()}>
              보내기
            </button>
          )}
        </div>
        <p className="hint">Enter 보내기 · Shift+Enter 줄바꿈</p>
      </form>
    </div>
  );
}
