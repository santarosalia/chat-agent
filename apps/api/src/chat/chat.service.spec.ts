import { ConfigService } from '@nestjs/config';
import {
  buildLegacyResultsResponse,
  buildRagRetrieveResponse,
  sampleRagApiCitation,
} from '../rag/rag-retrieve.fixtures';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { LLM_INPUT_MAX_MESSAGES } from './context-truncate';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { ChatService, getLastUserMessageContent } from './chat.service';
import { ChatRole } from './dto/chat-message.dto';
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

describe('getLastUserMessageContent', () => {
  it('returns content of the last user message', () => {
    const content = getLastUserMessageContent([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'middle' },
      { role: 'user', content: 'last question' },
    ]);
    expect(content).toBe('last question');
  });

  it('falls back to last message when no user role exists', () => {
    const content = getLastUserMessageContent([
      { role: 'assistant', content: 'only assistant' },
    ]);
    expect(content).toBe('only assistant');
  });
});

describe('ChatService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockStream.mockReset();
    mockLlmInvoke.mockReset();
    mockLlmInvoke.mockResolvedValue({ content: 'Assistant reply' });
  });

  function createConfig(
    extra: Record<string, string | undefined> = {},
  ): ConfigService {
    return {
      get: (key: string) => {
        const values: Record<string, string | undefined> = {
          VLLM_API_KEY: 'test-key',
          VLLM_BASE_URL: 'http://llm.local/v1',
          VLLM_MODEL: 'test-model',
          RAG_BASE: 'http://rag.local',
          ...extra,
        };
        return values[key];
      },
    } as ConfigService;
  }

  function createChatHistoryMock(): Pick<
    ChatHistoryService,
    'assertCanAppend' | 'appendTurn' | 'listActiveMessages'
  > {
    return {
      assertCanAppend: jest.fn().mockResolvedValue(undefined),
      appendTurn: jest.fn().mockResolvedValue(undefined),
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
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

  function createService(config: ConfigService = createConfig()) {
    return new ChatService(
      config,
      new RagRetrieveClient(config),
      createChatHistoryMock() as ChatHistoryService,
      sufficientEvaluator(),
    );
  }

  it('returns rag_used true with citations after retrieve-evaluate', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse(
          [
            {
              ...sampleRagApiCitation,
              filename: 'doc.pdf',
              page: 1,
              snippet: 'info',
            },
          ],
          { query: 'What is NestJS?' },
        ),
    });

    const service = createService();
    const response = await service.chat({
      messages: [{ role: ChatRole.User, content: 'What is NestJS?' }],
      group_id: 'team-a',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://rag.local/v1/retrieve',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    )).toMatchObject({
      group_id: 'team-a',
      top_k: 5,
    });
    expect(response).toEqual({
      message: { role: 'assistant', content: 'Assistant reply' },
      rag_used: true,
      citations: [{ filename: 'doc.pdf', page: 1, snippet: 'info', score: 0.91 }],
    });
  });

  it('omits group_id from retrieve when request has no group_id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.chat({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
    });

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(body).not.toHaveProperty('group_id');
    expect(body.top_k).toBe(5);
  });

  it('uses scheduled top_k 5 on the first retrieve even when request top_k is 10', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    await service.chat({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      group_id: 'team-a',
      top_k: 10,
    });

    expect(JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ).top_k).toBe(5);
  });

  it('retrieves with the last user query after loading session history', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const history = createChatHistoryMock();
    (history.listActiveMessages as jest.Mock).mockResolvedValue([
      { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
    ]);
    const service = new ChatService(
      createConfig(),
      new RagRetrieveClient(createConfig()),
      history as ChatHistoryService,
      sufficientEvaluator(),
    );

    await service.chat({
      session_id: '550e8400-e29b-41d4-a716-446655440000',
      messages: [{ role: ChatRole.User, content: '그건 며칠인가요?' }],
    });

    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string)
        .query,
    ).toBe('그건 며칠인가요?');
  });

  it('returns rag_used false without citations when seeded retrieve is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const response = await service.chat({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      group_id: 'team-a',
    });

    expect(JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ).query).toBe('Hello');
    expect(response).toEqual({
      message: { role: 'assistant', content: 'Assistant reply' },
      rag_used: false,
    });
    expect(response.citations).toBeUndefined();
  });

  it('truncates LLM input then seeds retrieve with the last user query', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const droppable = Array.from({ length: LLM_INPUT_MAX_MESSAGES }, (_, i) => ({
      role: ChatRole.Assistant,
      content: `history-${i}`,
    }));
    const messages = [
      ...droppable,
      { role: ChatRole.User, content: 'retrieve and answer this' },
    ];

    const service = createService();
    await service.chat({ messages, group_id: 'team-a' });

    expect(JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    ).query).toBe('retrieve and answer this');

    const llmMessages = mockLlmInvoke.mock.calls[0][0] as Array<{
      content: string;
    }>;
    expect(llmMessages.length).toBeLessThanOrEqual(LLM_INPUT_MAX_MESSAGES);
    expect(llmMessages[llmMessages.length - 1].content).toBe(
      'retrieve and answer this',
    );
    expect(llmMessages.some((m) => m.content === 'history-0')).toBe(false);
  });

  it('streamChat emits meta before delta and done in order', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse(
          [{ filename: 'doc.pdf', page: 2, snippet: 'ctx', score: 0.91 }],
          { query: 'Hi' },
        ),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    const metaIndex = joined.indexOf('event: meta');
    const deltaIndex = joined.indexOf('event: delta');
    const doneIndex = joined.indexOf('event: done');

    expect(metaIndex).toBeGreaterThanOrEqual(0);
    expect(deltaIndex).toBeGreaterThan(metaIndex);
    expect(doneIndex).toBeGreaterThan(deltaIndex);
    expect(joined).toContain('"rag_used":true');
    expect(joined).toContain('Assistant reply');
    expect(joined.slice(doneIndex)).not.toContain('"rag_used"');
    expect(joined.slice(doneIndex)).not.toContain('"citations"');
  });

  it('streamChat streams answer tokens after retrieve', async () => {
    async function* tokenStream() {
      yield { content: 'Hel' };
      yield { content: 'lo' };
    }
    mockStream.mockResolvedValue(tokenStream());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse(
          [{ filename: 'doc.pdf', page: 2, snippet: 'ctx', score: 0.91 }],
          { query: 'Hi' },
        ),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    const metaIndex = joined.indexOf('event: meta');
    const firstDelta = joined.indexOf('"content":"Hel"');
    expect(metaIndex).toBeGreaterThanOrEqual(0);
    expect(firstDelta).toBeGreaterThan(metaIndex);
    expect(joined).toContain('"content":"lo"');
    expect(joined).toContain('"rag_used":true');
    expect(joined).toContain('event: done');
    expect(joined).toContain('"content":"Hello"');
  });

  it('streamChat streams tokens after the seeded retrieve', async () => {
    async function* tokenStream() {
      yield { content: 'Hel' };
      yield { content: 'lo' };
    }
    mockStream.mockResolvedValue(tokenStream());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    expect(joined.indexOf('event: meta')).toBeGreaterThanOrEqual(0);
    expect(joined.indexOf('"content":"Hel"')).toBeGreaterThan(
      joined.indexOf('event: meta'),
    );
    expect(joined).toContain('"content":"lo"');
    expect(joined).toContain('"rag_used":false');
    expect(mockLlmInvoke).not.toHaveBeenCalled();
  });

  it('streamChat emits the first answer token before the LLM stream finishes', async () => {
    let releaseNextToken: (() => void) | undefined;
    const nextToken = new Promise<void>((resolve) => {
      releaseNextToken = resolve;
    });
    async function* tokenStream() {
      yield { content: 'Hel' };
      await nextToken;
      yield { content: 'lo' };
    }
    mockStream.mockResolvedValue(tokenStream());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const chunks: string[] = [];
    const finished = service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const started = Date.now();
    while (!chunks.join('').includes('"content":"Hel"')) {
      if (Date.now() - started > 1000) {
        throw new Error('first token was not emitted while the stream is open');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const duringStream = chunks.join('');
    expect(duringStream).toContain('event: meta');
    expect(duringStream).toContain('"content":"Hel"');
    expect(duringStream).not.toContain('"content":"lo"');
    expect(duringStream).not.toContain('event: done');

    releaseNextToken?.();
    await finished;

    const joined = chunks.join('');
    expect(joined).toContain('"content":"lo"');
    expect(joined).toContain('event: done');
  });

  it('streamChat emits error without done on LLM failure', async () => {
    mockLlmInvoke.mockRejectedValue(new Error('LLM down'));

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    expect(joined).toContain('event: error');
    expect(joined).not.toContain('event: done');
  });

  it('streamChat omits done when aborted before the answer finishes', async () => {
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
    const chunks: string[] = [];

    const streamPromise = service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
      controller.signal,
    );

    setTimeout(() => controller.abort(), 10);
    await streamPromise;

    const joined = chunks.join('');
    expect(joined).not.toContain('event: meta');
    expect(joined).not.toContain('event: done');
    expect(joined).not.toContain('event: error');
  });

  it('streamChat puts rag metadata only in meta event', async () => {

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse(
          [{ filename: 'doc.pdf', page: 2, snippet: 'ctx' }],
          { query: 'Hi' },
        ),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    expect(joined).toContain('event: meta');
    expect(joined).toContain('"rag_used":true');
    expect(joined).toContain('"citations"');
    expect(joined).toContain('event: delta');
    expect(joined).toContain('event: done');
  });

  it('streamChat meta reflects rag_used false when seeded retrieve is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const service = createService();
    const chunks: string[] = [];
    await service.streamChat(
      { messages: [{ role: ChatRole.User, content: 'Hi' }] },
      (chunk) => chunks.push(chunk),
    );

    const joined = chunks.join('');
    expect(joined).toContain('event: meta');
    expect(joined).toContain('"rag_used":false');
    expect(joined).not.toContain('"citations"');
  });

  it('returns rag_used false when seeded retrieve uses a legacy results body', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildLegacyResultsResponse([
          { filename: 'doc.pdf', page: 1, snippet: 'info' },
        ]),
    });

    const service = createService();
    const response = await service.chat({
      messages: [{ role: ChatRole.User, content: 'What is NestJS?' }],
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(response.rag_used).toBe(false);
    expect(response.citations).toBeUndefined();
  });
});
