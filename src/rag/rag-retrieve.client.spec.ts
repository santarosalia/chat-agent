import { ConfigService } from '@nestjs/config';
import {
  formatContextBlock,
  RagRetrieveClient,
} from './rag-retrieve.client';

describe('RagRetrieveClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function createClient(env: Record<string, string | undefined>) {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new RagRetrieveClient(config);
  }

  it('returns empty result when RAG_BASE is not configured', async () => {
    const client = createClient({});
    const result = await client.retrieve('hello');
    expect(result.ragUsed).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.contextBlock).toBeNull();
  });

  it('calls retrieve endpoint with hybrid mode and env defaults', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'how to start',
        mode: 'hybrid',
        backend: 'pgvector',
        citations: [
          {
            chunk_id: 'chunk-1',
            doc_id: 'doc-1',
            filename: 'guide.pdf',
            page: 2,
            score: 0.91,
            snippet: 'NestJS basics',
            rank: 1,
          },
        ],
        latency_ms: { total: 42.5 },
      }),
    });
    global.fetch = fetchMock;

    const client = createClient({
      RAG_BASE: 'http://rag.local',
      RAG_GROUP_ID: 'default-group',
      RAG_TOP_K: '3',
    });

    const result = await client.retrieve('how to start', 'req-group');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://rag.local/v1/retrieve',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'how to start',
          mode: 'hybrid',
          group_id: 'req-group',
          top_k: 3,
          rerank: true,
          snippet: true,
          content: false,
        }),
      }),
    );
    expect(result.ragUsed).toBe(true);
    expect(result.citations).toEqual([
      { filename: 'guide.pdf', page: 2, snippet: 'NestJS basics' },
    ]);
    expect(result.contextBlock).toBe(
      formatContextBlock(result.citations),
    );
  });

  it('falls back to env group_id when request group_id is absent', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ citations: [] }),
    });
    global.fetch = fetchMock;

    const client = createClient({
      RAG_BASE: 'http://rag.local/',
      RAG_GROUP_ID: 'env-group',
    });
    await client.retrieve('query');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).group_id).toBe(
      'env-group',
    );
  });

  it('returns empty result on 5xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query');
    expect(result.ragUsed).toBe(false);
  });

  it('returns empty result on timeout', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    jest.useFakeTimers();
    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const promise = client.retrieve('query');
    jest.advanceTimersByTime(5001);
    const result = await promise;
    jest.useRealTimers();

    expect(result.ragUsed).toBe(false);
  });

  it('returns empty result when citations are empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'query',
        mode: 'hybrid',
        backend: 'pgvector',
        citations: [],
        latency_ms: { total: 10 },
      }),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query');
    expect(result.ragUsed).toBe(false);
  });

  it('defaults page to 1 when rag citation page is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        citations: [
          {
            chunk_id: 'chunk-2',
            doc_id: 'doc-2',
            filename: 'notes.md',
            page: null,
            score: 0.8,
            snippet: 'Some note',
            rank: 1,
          },
        ],
      }),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query');
    expect(result.ragUsed).toBe(true);
    expect(result.citations).toEqual([
      { filename: 'notes.md', page: 1, snippet: 'Some note' },
    ]);
  });
});

describe('formatContextBlock', () => {
  it('formats citations as retrieved context block', () => {
    const block = formatContextBlock([
      { filename: 'a.pdf', page: 1, snippet: 'first' },
      { filename: 'b.pdf', page: 3, snippet: 'second' },
    ]);
    expect(block).toBe(
      '[Retrieved context]\n- (a.pdf p.1) first\n- (b.pdf p.3) second',
    );
  });
});
