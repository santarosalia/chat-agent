import { formatHttpLogLine, httpLogFieldsFromRequest } from './http-log';

describe('formatHttpLogLine', () => {
  it('formats method, path, status, and duration', () => {
    expect(
      formatHttpLogLine({
        method: 'GET',
        path: '/health',
        statusCode: 200,
        durationMs: 4,
      }),
    ).toBe('GET /health 200 4ms');
  });

  it('appends session_id, user_id, group_id, and top_k when present', () => {
    expect(
      formatHttpLogLine({
        method: 'POST',
        path: '/chat',
        statusCode: 200,
        durationMs: 1234,
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'user-a',
        groupId: 'hr-docs',
        topK: 10,
      }),
    ).toBe(
      'POST /chat 200 1234ms session_id=550e8400-e29b-41d4-a716-446655440000 user_id=user-a group_id=hr-docs top_k=10',
    );
  });

  it('omits optional fields that are missing', () => {
    expect(
      formatHttpLogLine({
        method: 'POST',
        path: '/chat/stream',
        statusCode: 200,
        durationMs: 50,
        topK: 5,
      }),
    ).toBe('POST /chat/stream 200 50ms top_k=5');
  });
});

describe('httpLogFieldsFromRequest', () => {
  it('reads chat fields from the body and ignores messages', () => {
    expect(
      httpLogFieldsFromRequest({
        method: 'POST',
        url: '/chat',
        body: {
          messages: [{ role: 'user', content: 'secret question' }],
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          user_id: 'user-a',
          group_id: 'hr-docs',
          top_k: 10,
        },
      }),
    ).toEqual({
      method: 'POST',
      path: '/chat',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'user-a',
      groupId: 'hr-docs',
      topK: 10,
    });
  });

  it('prefers originalUrl and skips empty optional fields', () => {
    expect(
      httpLogFieldsFromRequest({
        method: 'GET',
        url: '/sessions/abc',
        originalUrl: '/sessions/abc?x=1',
        body: {},
      }),
    ).toEqual({
      method: 'GET',
      path: '/sessions/abc?x=1',
    });
  });
});
