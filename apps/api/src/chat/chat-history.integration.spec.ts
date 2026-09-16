import { ConflictException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import {
  buildRagRetrieveResponse,
} from '../rag/rag-retrieve.fixtures';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import {
  ChatService,
  getLastUserMessageContentForHistory,
} from './chat.service';
import { ChatRole } from './dto/chat-message.dto';
import { ANSWER_SYSTEM_PROMPT } from './answer-system-prompt';
import { RetrieveSufficiencyEvaluator } from './retrieve-sufficiency-evaluator.service';

const mockStream = jest.fn();
const mockLlmInvoke = jest
  .fn()
  .mockResolvedValue({ content: 'Assistant reply' });

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    stream: mockStream,
    invoke: mockLlmInvoke,
    bindTools: jest.fn().mockImplementation(function bindTools() {
      return this;
    }),
  })),
}));

describe('ChatService chat history integration', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';
  const originalFetch = global.fetch;

  let chatHistory: {
    assertCanAppend: jest.Mock;
    appendTurn: jest.Mock;
    listActiveMessages: jest.Mock;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    mockStream.mockReset();
    mockLlmInvoke.mockReset();
    mockLlmInvoke.mockResolvedValue({ content: 'Assistant reply' });
  });

  function createConfig(): ConfigService {
    return {
      get: (key: string) => {
        const values: Record<string, string | undefined> = {
          VLLM_API_KEY: 'test-key',
          VLLM_BASE_URL: 'http://llm.local/v1',
          VLLM_MODEL: 'test-model',
          RAG_BASE: 'http://rag.local',
        };
        return values[key];
      },
    } as ConfigService;
  }

  function sufficientEvaluator(): RetrieveSufficiencyEvaluator {
    return {
      evaluate: jest.fn().mockResolvedValue({
        sufficient: true,
        missing: [],
        confidence: 1,
      }),
    } as unknown as RetrieveSufficiencyEvaluator;
  }

  function createService() {
    chatHistory = {
      assertCanAppend: jest.fn().mockResolvedValue(undefined),
      appendTurn: jest.fn().mockResolvedValue(undefined),
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    return new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );
  }

  it('skips history when session_id is omitted', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.chat({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    expect(chatHistory.assertCanAppend).not.toHaveBeenCalled();
    expect(chatHistory.appendTurn).not.toHaveBeenCalled();
    expect(chatHistory.listActiveMessages).not.toHaveBeenCalled();
  });

  it('loads stored turns and prepends them to the new user message for the LLM', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    chatHistory.listActiveMessages.mockResolvedValueOnce([
      { role: ChatRole.User, content: 'old question' },
      { role: ChatRole.Assistant, content: 'old reply' },
    ]);

    await service.chat({
      session_id: sessionId,
      messages: [{ role: ChatRole.User, content: 'follow up' }],
    });

    expect(chatHistory.listActiveMessages).toHaveBeenCalledWith(sessionId);
    expect(
      (mockLlmInvoke.mock.calls[0][0] as Array<{ content: string }>)
        .map((message) => message.content)
        .slice(0, 4),
    ).toEqual([ANSWER_SYSTEM_PROMPT, 'old question', 'old reply', 'follow up']);
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
        .query,
    ).toBe('follow up');
  });

  it('ignores extra request history when session_id is present', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    chatHistory.listActiveMessages.mockResolvedValueOnce([
      { role: ChatRole.User, content: 'stored question' },
      { role: ChatRole.Assistant, content: 'stored reply' },
    ]);

    await service.chat({
      session_id: sessionId,
      messages: [
        { role: ChatRole.User, content: 'client stale question' },
        { role: ChatRole.Assistant, content: 'client stale reply' },
        { role: ChatRole.User, content: 'follow up' },
      ],
    });

    expect(
      (mockLlmInvoke.mock.calls[0][0] as Array<{ content: string }>)
        .map((message) => message.content)
        .slice(0, 4),
    ).toEqual([ANSWER_SYSTEM_PROMPT, 'stored question', 'stored reply', 'follow up']);
  });

  it('appends user and assistant after successful chat', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.chat({
      session_id: sessionId,
      user_id: 'user-a',
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    expect(chatHistory.assertCanAppend).toHaveBeenCalledWith(
      sessionId,
      'user-a',
    );
    expect(chatHistory.appendTurn).toHaveBeenCalledWith({
      sessionId,
      userId: 'user-a',
      userContent: 'Hello',
      assistantContent: 'Assistant reply',
      ragUsed: false,
      citations: undefined,
    });
  });

  it('propagates 410 from ensureHistoryAllowed before chat', async () => {
    chatHistory = {
      assertCanAppend: jest
        .fn()
        .mockRejectedValue(new GoneException('Session has been deleted')),
      appendTurn: jest.fn(),
      listActiveMessages: jest.fn(),
    };
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );

    global.fetch = jest.fn();

    await expect(
      service.chat({
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hello' }],
      }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chatHistory.appendTurn).not.toHaveBeenCalled();
  });

  it('appends after successful stream done', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.streamChat(
      {
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hi' }],
      },
      () => undefined,
    );

    expect(chatHistory.appendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        userContent: 'Hi',
        assistantContent: 'Assistant reply',
      }),
    );
  });

  it('skips append on stream abort', async () => {
    mockLlmInvoke.mockImplementation(
      (_messages: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const controller = new AbortController();
    const streamPromise = service.streamChat(
      {
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hi' }],
      },
      () => undefined,
      controller.signal,
    );

    setTimeout(() => controller.abort(), 10);
    await streamPromise;

    expect(chatHistory.appendTurn).not.toHaveBeenCalled();
  });

  it('returns chat response when appendTurn fails with DB error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    chatHistory = {
      assertCanAppend: jest.fn().mockResolvedValue(undefined),
      appendTurn: jest.fn().mockRejectedValue(new Error('connection refused')),
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );

    const response = await service.chat({
      session_id: sessionId,
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    expect(response.message.content).toBe('Assistant reply');
    expect(chatHistory.appendTurn).toHaveBeenCalled();
  });

  it('does not emit error event when persist fails after stream done', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    chatHistory = {
      assertCanAppend: jest.fn().mockResolvedValue(undefined),
      appendTurn: jest.fn().mockRejectedValue(new Error('insert failed')),
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );

    const chunks: string[] = [];
    await service.streamChat(
      {
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hi' }],
      },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    expect(joined).toContain('event: done');
    expect(joined).not.toContain('event: error');
  });

  it('continues chat when ensureHistoryAllowed hits non-client DB error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    chatHistory = {
      assertCanAppend: jest
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
      appendTurn: jest.fn(),
      listActiveMessages: jest.fn(),
    };
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );

    const response = await service.chat({
      session_id: sessionId,
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    expect(response.message.content).toBe('Assistant reply');
    expect(global.fetch).toHaveBeenCalled();
    expect(chatHistory.appendTurn).not.toHaveBeenCalled();
  });

  it('still propagates 409 from ensureHistoryAllowed', async () => {
    chatHistory = {
      assertCanAppend: jest
        .fn()
        .mockRejectedValue(
          new ConflictException('user_id does not match frozen session owner'),
        ),
      appendTurn: jest.fn(),
      listActiveMessages: jest.fn(),
    };
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      chatHistory as unknown as ChatHistoryService,
      sufficientEvaluator(),
    );

    global.fetch = jest.fn();

    await expect(
      service.chat({
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hello' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips append on stream error', async () => {
    mockLlmInvoke.mockRejectedValue(new Error('LLM down'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.streamChat(
      {
        session_id: sessionId,
        messages: [{ role: ChatRole.User, content: 'Hi' }],
      },
      () => undefined,
    );

    expect(chatHistory.appendTurn).not.toHaveBeenCalled();
  });
});

describe('getLastUserMessageContentForHistory', () => {
  it('returns last user message and ignores system/assistant', () => {
    expect(
      getLastUserMessageContentForHistory([
        { role: ChatRole.System, content: 'injected rag' },
        { role: ChatRole.User, content: 'first' },
        { role: ChatRole.Assistant, content: 'reply' },
        { role: ChatRole.User, content: 'last user' },
      ]),
    ).toBe('last user');
  });

  it('returns undefined when no user message exists', () => {
    expect(
      getLastUserMessageContentForHistory([
        { role: ChatRole.Assistant, content: 'only assistant' },
      ]),
    ).toBeUndefined();
  });
});
