import { formatLlmRequestLog } from './llm-request-log';

describe('formatLlmRequestLog', () => {
  it('includes model, base url, and each role/content in order', () => {
    expect(
      formatLlmRequestLog({
        model: 'test-model',
        baseUrl: 'http://llm.local/v1',
        messages: [
          { role: 'system', content: '[Retrieved context]\n- (doc.pdf p.1) info' },
          { role: 'user', content: 'What is NestJS?' },
        ],
      }),
    ).toBe(
      [
        'LLM request model=test-model base_url=http://llm.local/v1 messages=2',
        '[0] system',
        '[Retrieved context]',
        '- (doc.pdf p.1) info',
        '[1] user',
        'What is NestJS?',
      ].join('\n'),
    );
  });
});
