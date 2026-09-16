import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { RetrieveSufficiencyEvaluator } from './retrieve-sufficiency-evaluator.service';
import {
  EVALUATOR_MAX_TOKENS,
  EVALUATOR_SYSTEM_PROMPT,
} from './retrieve-sufficiency';

const mockInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

describe('RetrieveSufficiencyEvaluator', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        VLLM_API_KEY: 'test-key',
        VLLM_BASE_URL: 'http://llm.local/v1',
        VLLM_MODEL: 'test-model',
      };
      return values[key];
    },
  } as ConfigService;

  beforeEach(() => {
    mockInvoke.mockReset();
    (ChatOpenAI as unknown as jest.Mock).mockClear();
  });

  it('constructs the evaluator LLM with a 200 token cap', () => {
    new RetrieveSufficiencyEvaluator(config);

    expect(ChatOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: EVALUATOR_MAX_TOKENS }),
    );
  });

  it('parses evaluator JSON from the LLM', async () => {
    mockInvoke.mockResolvedValue({
      content:
        '{ "sufficient": false, "missing": [ "B의 적용 조건", "B의 예외 사항" ], "confidence": 0.72 }',
    });
    const evaluator = new RetrieveSufficiencyEvaluator(config);

    await expect(
      evaluator.evaluate({
        question: '규정 B는 언제 적용돼?',
        citations: [{ filename: 'a.pdf', page: 1, snippet: '정의만 있음' }],
        searchHistory: [
          { query: '규정 B는 언제 적용돼?', topK: 5, ragUsed: true, citationCount: 1 },
        ],
        evaluationHistory: [],
      }),
    ).resolves.toEqual({
      sufficient: false,
      missing: ['B의 적용 조건', 'B의 예외 사항'],
      confidence: 0.72,
    });
    const messages = mockInvoke.mock.calls[0][0] as Array<{ content: string }>;
    expect(messages[0].content).toBe(EVALUATOR_SYSTEM_PROMPT);
  });

  it('falls back to insufficient when the evaluator LLM fails', async () => {
    mockInvoke.mockRejectedValue(new Error('LLM down'));
    const evaluator = new RetrieveSufficiencyEvaluator(config);

    await expect(
      evaluator.evaluate({
        question: '연차 며칠이야?',
        citations: [],
        searchHistory: [],
        evaluationHistory: [],
      }),
    ).resolves.toEqual({
      sufficient: false,
      missing: [],
      confidence: 0,
    });
  });
});
