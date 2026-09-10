import {
  chunkString,
  extractStreamChunkContent,
  formatSseEvent,
} from './sse';

describe('formatSseEvent', () => {
  it('formats meta event with JSON data', () => {
    expect(formatSseEvent('meta', { rag_used: true })).toBe(
      'event: meta\ndata: {"rag_used":true}\n\n',
    );
  });

  it('formats delta event', () => {
    expect(formatSseEvent('delta', { content: 'hello' })).toBe(
      'event: delta\ndata: {"content":"hello"}\n\n',
    );
  });

  it('formats done event with citations', () => {
    const payload = {
      message: { role: 'assistant' as const, content: 'full' },
      rag_used: true,
      citations: [{ filename: 'a.pdf', page: 1, snippet: 'x' }],
    };
    expect(formatSseEvent('done', payload)).toContain('event: done');
    expect(formatSseEvent('done', payload)).toContain('"rag_used":true');
  });

  it('formats error event', () => {
    expect(formatSseEvent('error', { message: 'failed' })).toBe(
      'event: error\ndata: {"message":"failed"}\n\n',
    );
  });
});

describe('chunkString', () => {
  it('splits text into fixed-size chunks', () => {
    expect(chunkString('abcdef', 2)).toEqual(['ab', 'cd', 'ef']);
  });

  it('returns empty array for empty text', () => {
    expect(chunkString('', 4)).toEqual([]);
  });

  it('returns single chunk when shorter than chunk size', () => {
    expect(chunkString('hi', 8)).toEqual(['hi']);
  });
});

describe('extractStreamChunkContent', () => {
  it('returns string content as-is', () => {
    expect(extractStreamChunkContent('token')).toBe('token');
  });

  it('joins text parts from array content', () => {
    expect(extractStreamChunkContent([{ text: 'a' }, { text: 'b' }])).toBe(
      'ab',
    );
  });

  it('returns empty string for nullish content', () => {
    expect(extractStreamChunkContent(null)).toBe('');
    expect(extractStreamChunkContent(undefined)).toBe('');
  });
});
