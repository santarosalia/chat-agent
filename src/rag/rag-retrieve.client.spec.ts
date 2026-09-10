import { ConfigService } from '@nestjs/config';
import {
  buildLegacyResultsResponse,
  buildRagRetrieveResponse,
  sampleRagApiCitation,
} from './rag-retrieve.fixtures';
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
    const result = await client.retrieve('hello', 'group-a');
    expect(result.ragUsed).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.contextBlock).toBeNull();
  });

  it('calls retrieve endpoint with request group_id and top_k', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse([sampleRagApiCitation], {
          query: 'how to start',
        }),
    });
    global.fetch = fetchMock;

    const client = createClient({
      RAG_BASE: 'http://rag.local',
    });

    const result = await client.retrieve('how to start', 'req-group', 3);

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

  it('defaults top_k to 5 when not provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });
    global.fetch = fetchMock;

    const client = createClient({ RAG_BASE: 'http://rag.local/' });
    await client.retrieve('query', 'group-a');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).top_k).toBe(5);
  });

  it('does not use RAG when response only has legacy results field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildLegacyResultsResponse([
          { filename: 'doc.pdf', page: 1, snippet: 'legacy shape' },
        ]),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query', 'group-a');

    expect(result.ragUsed).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.contextBlock).toBeNull();
  });

  it('returns empty result on 5xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query', 'group-a');
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
    const promise = client.retrieve('query', 'group-a');
    jest.advanceTimersByTime(5001);
    const result = await promise;
    jest.useRealTimers();

    expect(result.ragUsed).toBe(false);
  });

  it('returns empty result when citations are empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => buildRagRetrieveResponse([]),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query', 'group-a');
    expect(result.ragUsed).toBe(false);
  });

  it('defaults page to 1 when rag citation page is null', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        buildRagRetrieveResponse([
          {
            chunk_id: 'chunk-2',
            doc_id: 'doc-2',
            filename: 'notes.md',
            page: null,
            score: 0.8,
            snippet: 'Some note',
            rank: 1,
          },
        ]),
    });

    const client = createClient({ RAG_BASE: 'http://rag.local' });
    const result = await client.retrieve('query', 'group-a');
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
