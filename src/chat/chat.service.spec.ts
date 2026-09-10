import { ConfigService } from '@nestjs/config';
import {
  buildLegacyResultsResponse,
  buildRagRetrieveResponse,
  sampleRagApiCitation,
} from '../rag/rag-retrieve.fixtures';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { ChatService, getLastUserMessageContent } from './chat.service';
import { ChatRole } from './dto/chat-message.dto';

jest.mock('./chat.graph', () => ({
  createChatGraph: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({ response: 'Assistant reply' }),
  })),
  toLangChainMessages: jest.fn((messages) => messages),
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
    jest.restoreAllMocks();
  });

  function createConfig(
    extra: Record<string, string | undefined> = {},
  ): ConfigService {
    return {
      get: (key: string) => {
        const values: Record<string, string | undefined> = {
          OPENAI_API_KEY: 'test-key',
          OPENAI_BASE_URL: 'http://llm.local/v1',
          OPENAI_MODEL: 'test-model',
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
