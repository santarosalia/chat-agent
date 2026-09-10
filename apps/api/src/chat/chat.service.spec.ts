import { ConfigService } from '@nestjs/config';
import {
  buildLegacyResultsResponse,
  buildRagRetrieveResponse,
  sampleRagApiCitation,
} from '../rag/rag-retrieve.fixtures';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { createChatGraph, toLangChainMessages } from './chat.graph';
import { LLM_INPUT_MAX_MESSAGES } from './context-truncate';
import { ChatService, getLastUserMessageContent } from './chat.service';
import { ChatRole } from './dto/chat-message.dto';

const mockStream = jest.fn();

jest.mock('./chat.graph', () => ({
  createChatGraph: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({ response: 'Assistant reply' }),
  })),
  toLangChainMessages: jest.fn((messages) => messages),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    stream: mockStream,
    invoke: jest.fn(),
  })),
}));

const mockCreateChatGraph = createChatGraph as jest.MockedFunction<
  typeof createChatGraph
>;
const mockToLangChainMessages = toLangChainMessages as jest.MockedFunction<
  typeof toLangChainMessages
>;

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

  function createService(config: ConfigService = createConfig()) {
    return new ChatService(config, new RagRetrieveClient(config));
  }

  it('returns rag_used true with citations when RAG API returns citations', async () => {
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
      citations: [{ filename: 'doc.pdf', page: 1, snippet: 'info' }],
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

  it('passes request top_k to retrieve when provided', async () => {
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
    ).top_k).toBe(10);
  });

  it('returns rag_used false without citations when RAG API returns empty citations', async () => {
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
    ).group_id).toBe('team-a');
    expect(response).toEqual({
      message: { role: 'assistant', content: 'Assistant reply' },
      rag_used: false,
    });
    expect(response.citations).toBeUndefined();
  });

  it('truncates LLM input after RAG inject while retrieve uses last user as-is', async () => {
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

    const retrieveBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(retrieveBody.query).toBe('retrieve and answer this');

    const llmMessages = mockToLangChainMessages.mock.calls[0][0];
    expect(llmMessages.length).toBeLessThanOrEqual(LLM_INPUT_MAX_MESSAGES);
    expect(llmMessages[llmMessages.length - 1]).toEqual({
      role: ChatRole.User,
      content: 'retrieve and answer this',
    });
    expect(llmMessages.some((m) => m.content === 'history-0')).toBe(false);
  });

  it('streamChat emits meta before delta and done in order', async () => {
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
    const metaIndex = joined.indexOf('event: meta');
    const deltaIndex = joined.indexOf('event: delta');
    const doneIndex = joined.indexOf('event: done');

    expect(metaIndex).toBeGreaterThanOrEqual(0);
    expect(deltaIndex).toBeGreaterThan(metaIndex);
    expect(doneIndex).toBeGreaterThan(deltaIndex);
    expect(joined).toContain('"rag_used":true');
    expect(joined).toContain('"content":"Hel"');
    expect(joined).toContain('"content":"Hello"');
    expect(joined.slice(doneIndex)).not.toContain('"rag_used"');
    expect(joined.slice(doneIndex)).not.toContain('"citations"');
  });

  it('streamChat emits error without duplicate deltas when stream fails after partial output', async () => {
    async function* failingStream() {
      yield { content: 'partial' };
      throw new Error('stream broke');
    }
    mockStream.mockResolvedValue(failingStream());

    const mockInvoke = jest
      .fn()
      .mockResolvedValue({ response: 'full fallback' });
    mockCreateChatGraph.mockReturnValueOnce({
      invoke: mockInvoke,
    } as never);

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
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(joined).toContain('event: meta');
    expect(joined).toContain('"content":"partial"');
    expect((joined.match(/event: delta/g) ?? []).length).toBe(1);
    expect(joined).not.toContain('full fallback');
    expect(joined).toContain('event: error');
    expect(joined).not.toContain('event: done');
  });

  it('streamChat emits error without done on LLM failure', async () => {
    mockStream.mockRejectedValue(new Error('LLM down'));

    const mockInvoke = jest.fn().mockRejectedValue(new Error('LLM down'));
    mockCreateChatGraph.mockReturnValueOnce({
      invoke: mockInvoke,
    } as never);

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

  it('streamChat omits done when aborted mid-stream', async () => {
    async function* tokenStream() {
      yield { content: 'partial' };
      await new Promise((resolve) => setTimeout(resolve, 50));
      yield { content: 'more' };
    }
    mockStream.mockResolvedValue(tokenStream());

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
    expect(joined).toContain('event: meta');
    expect(joined).not.toContain('event: done');
    expect(joined).not.toContain('event: error');
  });

  it('streamChat puts rag metadata only in meta event', async () => {
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

  it('streamChat meta reflects rag_used false on RAG fallback', async () => {
    async function* tokenStream() {
      yield { content: 'ok' };
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
    expect(joined).toContain('event: meta');
    expect(joined).toContain('"rag_used":false');
    expect(joined).not.toContain('"citations"');
  });

  it('returns rag_used false when RAG API responds with legacy results field only', async () => {
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
      group_id: 'team-a',
    });

    expect(response.rag_used).toBe(false);
    expect(response.citations).toBeUndefined();
  });
});
