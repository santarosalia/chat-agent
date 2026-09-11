import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatRequest, isSessionUuid, sessionHistoryToThread, toChatRequestMessages } from './chat-thread.ts';
import type { ThreadMessage } from './chat-thread.ts';

function msg(
  partial: Partial<ThreadMessage> & Pick<ThreadMessage, 'id' | 'role'>,
): ThreadMessage {
  return { content: '', ...partial };
}

describe('toChatRequestMessages', () => {
  it('keeps completed user and assistant turns for the API', () => {
    const thread: ThreadMessage[] = [
      msg({ id: '1', role: 'user', content: '휴가 며칠이야?' }),
      msg({
        id: '2',
        role: 'assistant',
        content: '20일입니다.',
        ragUsed: true,
      }),
    ];

    assert.deepEqual(toChatRequestMessages(thread), [
      { role: 'user', content: '휴가 며칠이야?' },
      { role: 'assistant', content: '20일입니다.' },
    ]);
  });

  it('omits an empty in-flight assistant so retrieve sees only real turns', () => {
    const thread: ThreadMessage[] = [
      msg({ id: '1', role: 'user', content: '핸드북?' }),
      msg({ id: '2', role: 'assistant', content: '', streaming: true }),
    ];

    assert.deepEqual(toChatRequestMessages(thread), [
      { role: 'user', content: '핸드북?' },
    ]);
  });

  it('omits assistant turns that failed with an error', () => {
    const thread: ThreadMessage[] = [
      msg({ id: '1', role: 'user', content: '질문' }),
      msg({
        id: '2',
        role: 'assistant',
        content: '',
        error: 'LLM request failed',
      }),
    ];

    assert.deepEqual(toChatRequestMessages(thread), [
      { role: 'user', content: '질문' },
    ]);
  });
});

describe('buildChatRequest', () => {
  it('sends only the latest user turn even when the thread has history', () => {
    const thread: ThreadMessage[] = [
      msg({ id: '1', role: 'user', content: '이전 질문' }),
      msg({ id: '2', role: 'assistant', content: '이전 답' }),
      msg({ id: '3', role: 'user', content: '이번 질문' }),
    ];

    assert.deepEqual(buildChatRequest(thread, { groupId: '', topK: '' }), {
      messages: [{ role: 'user', content: '이번 질문' }],
    });

    assert.deepEqual(
      buildChatRequest(thread, { groupId: 'hr-docs', topK: '10' }),
      {
        messages: [{ role: 'user', content: '이번 질문' }],
        group_id: 'hr-docs',
        top_k: 10,
      },
    );
  });

  it('adds session_id and user_id only when provided', () => {
    const thread: ThreadMessage[] = [
      msg({ id: '1', role: 'user', content: '질문' }),
    ];
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';

    assert.deepEqual(
      buildChatRequest(thread, {
        groupId: '',
        topK: '',
        sessionId,
        userId: 'user-a',
      }),
      {
        messages: [{ role: 'user', content: '질문' }],
        session_id: sessionId,
        user_id: 'user-a',
      },
    );

    assert.deepEqual(
      buildChatRequest(thread, {
        groupId: '',
        topK: '',
        sessionId: '  ',
        userId: '',
      }),
      {
        messages: [{ role: 'user', content: '질문' }],
      },
    );
  });
});

describe('isSessionUuid', () => {
  it('accepts a UUID and rejects empty or partial values', () => {
    assert.equal(
      isSessionUuid('550e8400-e29b-41d4-a716-446655440000'),
      true,
    );
    assert.equal(isSessionUuid(''), false);
    assert.equal(isSessionUuid('550e8400-e29b-41d4-a716'), false);
  });
});

describe('sessionHistoryToThread', () => {
  it('maps stored turns into thread messages with stable ids', () => {
    const thread = sessionHistoryToThread(
      '550e8400-e29b-41d4-a716-446655440000',
      [
        { role: 'user', content: '질문' },
        {
          role: 'assistant',
          content: '답변',
          rag_used: true,
          citations: [{ filename: 'a.pdf', page: 1, snippet: 'ctx' }],
        },
      ],
    );

    assert.equal(thread[0].role, 'user');
    assert.equal(thread[0].content, '질문');
    assert.equal(thread[1].role, 'assistant');
    assert.equal(thread[1].ragUsed, true);
    assert.deepEqual(thread[1].citations, [
      { filename: 'a.pdf', page: 1, snippet: 'ctx' },
    ]);
    assert.equal(
      thread[0].id,
      '550e8400-e29b-41d4-a716-446655440000:0',
    );
  });
});
