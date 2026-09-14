import { formatLlmRequestLog } from './llm-request-log';

describe('formatLlmRequestLog', () => {
  it('prints model, base url, and messages as JSON', () => {
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
      JSON.stringify(
        {
          event: 'llm_request',
          model: 'test-model',
          base_url: 'http://llm.local/v1',
          messages: [
            {
              role: 'system',
              content: '[Retrieved context]\n- (doc.pdf p.1) info',
            },
            { role: 'user', content: 'What is NestJS?' },
          ],
        },
        null,
        2,
      ),
    );
  });

  it('omits base_url when it is missing', () => {
    expect(
      JSON.parse(
        formatLlmRequestLog({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ),
    ).toEqual({
      event: 'llm_request',
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });
});
