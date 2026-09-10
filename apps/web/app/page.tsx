'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  ChatMessage,
  Citation,
  postChat,
  postChatStream,
} from '@/lib/chat-api';

export default function HomePage() {
  const [userInput, setUserInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [topK, setTopK] = useState('');
  const [useStream, setUseStream] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assistantText, setAssistantText] = useState('');
  const [ragUsed, setRagUsed] = useState<boolean | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);

  const apiUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAssistantText('');
    setRagUsed(null);
    setCitations([]);

    const trimmed = userInput.trim();
    if (!trimmed) {
      setError('메시지를 입력하세요.');
      return;
    }

    const messages: ChatMessage[] = [{ role: 'user', content: trimmed }];
    const body: {
      messages: ChatMessage[];
      group_id?: string;
      top_k?: number;
    } = { messages };

    if (groupId.trim()) {
      body.group_id = groupId.trim();
    }
    const parsedTopK = Number(topK);
    if (topK.trim() && Number.isInteger(parsedTopK) && parsedTopK >= 1) {
      body.top_k = parsedTopK;
    }

    setLoading(true);
    try {
      if (useStream) {
        await postChatStream(body, {
          onMeta: (meta) => {
            setRagUsed(meta.rag_used);
            setCitations(meta.citations ?? []);
          },
          onDelta: (content) => {
            setAssistantText((prev) => prev + content);
          },
          onDone: (data) => {
            setAssistantText(data.message.content);
            setRagUsed(data.rag_used);
            setCitations(data.citations ?? []);
          },
          onError: (message) => {
            setError(message);
          },
        });
      } else {
        const response = await postChat(body);
        setAssistantText(response.message.content);
        setRagUsed(response.rag_used);
        setCitations(response.citations ?? []);
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : '요청에 실패했습니다.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>chat-agent test UI</h1>
      <p className="subtitle">
        로컬 API({apiUrl})용 테스트 전용 UI — 로그인·히스토리 저장 없음
      </p>

      <form className="panel" onSubmit={handleSubmit}>
        <label htmlFor="message">User message</label>
        <textarea
          id="message"
          value={userInput}
          onChange={(event) => setUserInput(event.target.value)}
          placeholder="질문을 입력하세요"
        />

        <div className="row" style={{ marginTop: '1rem' }}>
          <div>
            <label htmlFor="group-id">group_id (optional)</label>
            <input
              id="group-id"
              type="text"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="hr-docs"
            />
          </div>
          <div>
            <label htmlFor="top-k">top_k (optional)</label>
            <input
              id="top-k"
              type="number"
              min={1}
              value={topK}
              onChange={(event) => setTopK(event.target.value)}
              placeholder="5"
            />
          </div>
        </div>

        <div className="controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={useStream}
              onChange={(event) => setUseStream(event.target.checked)}
            />
            POST /chat/stream (SSE)
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Sending…' : useStream ? 'Stream chat' : 'Send chat'}
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="meta" style={{ marginBottom: '0.75rem' }}>
          rag_used:{' '}
          {ragUsed === null ? (
            '—'
          ) : (
            <span className={`badge ${ragUsed ? 'on' : 'off'}`}>
              {ragUsed ? 'true' : 'false'}
            </span>
          )}
        </div>

        <label>Assistant response</label>
        <div className="assistant">
          {assistantText || (loading ? '…' : '응답이 여기에 표시됩니다.')}
        </div>

        {citations.length > 0 && (
          <>
            <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>
              Citations
            </h2>
            <ol className="citations">
              {citations.map((citation, index) => (
                <li key={`${citation.filename}-${citation.page}-${index}`}>
                  <strong>
                    {citation.filename} p.{citation.page}
                  </strong>
                  <div>{citation.snippet}</div>
                </li>
              ))}
            </ol>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
