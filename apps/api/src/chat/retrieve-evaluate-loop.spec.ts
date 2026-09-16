import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { runRetrieveEvaluateLoop } from './retrieve-evaluate-loop';
import { SufficiencyEvaluation } from './retrieve-sufficiency';

describe('runRetrieveEvaluateLoop', () => {
  const emptyRetrieval = {
    ragUsed: false,
    citations: [],
    contextBlock: null,
  };

  it('retrieves once with top_k 5 and stops when sufficient', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      ragUsed: true,
      citations: [{ filename: 'a.pdf', page: 1, snippet: '연차 15일' }],
      contextBlock: '[Retrieved context]\n- (a.pdf p.1) 연차 15일',
    });
    const evaluate = jest.fn().mockResolvedValue({
      sufficient: true,
      missing: [],
      confidence: 0.9,
    } satisfies SufficiencyEvaluation);

    const result = await runRetrieveEvaluateLoop({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      evaluator: { evaluate },
      question: '연차 며칠이야?',
      groupId: 'team-a',
    });

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('연차 며칠이야?', 'team-a', 5);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.retrieval.ragUsed).toBe(true);
    expect(result.searchHistory).toEqual([
      { query: '연차 며칠이야?', topK: 5, ragUsed: true, citationCount: 1 },
    ]);
    expect(result.evaluationHistory).toEqual([
      { sufficient: true, missing: [], confidence: 0.9 },
    ]);
  });

  it('retrieves a second time with missing query and top_k 10', async () => {
    const retrieve = jest.fn().mockResolvedValue(emptyRetrieval);
    const evaluate = jest
      .fn()
      .mockResolvedValueOnce({
        sufficient: false,
        missing: ['B의 적용 조건', 'B의 예외 사항'],
        confidence: 0.72,
      })
      .mockResolvedValueOnce({
        sufficient: true,
        missing: [],
        confidence: 0.88,
      });

    const result = await runRetrieveEvaluateLoop({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      evaluator: { evaluate },
      question: '규정 B는 언제 적용돼?',
    });

    expect(retrieve).toHaveBeenNthCalledWith(
      1,
      '규정 B는 언제 적용돼?',
      undefined,
      5,
    );
    expect(retrieve).toHaveBeenNthCalledWith(
      2,
      'B의 적용 조건 B의 예외 사항',
      undefined,
      10,
    );
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(result.searchHistory.map((entry) => entry.topK)).toEqual([5, 10]);
    expect(result.evaluationHistory[0].missing).toEqual([
      'B의 적용 조건',
      'B의 예외 사항',
    ]);
  });

  it('stops after 3 retrieves with top_k 5, 10, 20', async () => {
    const retrieve = jest.fn().mockResolvedValue(emptyRetrieval);
    const evaluate = jest.fn().mockResolvedValue({
      sufficient: false,
      missing: ['더 필요'],
      confidence: 0.3,
    });

    const result = await runRetrieveEvaluateLoop({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      evaluator: { evaluate },
      question: '아이작 예산',
      groupId: 'team-a',
    });

    expect(retrieve).toHaveBeenNthCalledWith(1, '아이작 예산', 'team-a', 5);
    expect(retrieve).toHaveBeenNthCalledWith(2, '더 필요', 'team-a', 10);
    expect(retrieve).toHaveBeenNthCalledWith(3, '더 필요', 'team-a', 20);
    expect(retrieve).toHaveBeenCalledTimes(3);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(result.searchHistory.map((entry) => entry.topK)).toEqual([
      5, 10, 20,
    ]);
    expect(result.evaluationHistory).toHaveLength(3);
  });

  it('passes search and evaluation history into later evaluations', async () => {
    const retrieve = jest.fn().mockResolvedValue(emptyRetrieval);
    const evaluate = jest
      .fn()
      .mockResolvedValueOnce({
        sufficient: false,
        missing: ['코바코 예산'],
        confidence: 0.5,
      })
      .mockResolvedValueOnce({
        sufficient: true,
        missing: [],
        confidence: 0.8,
      });

    await runRetrieveEvaluateLoop({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      evaluator: { evaluate },
      question: '아이작이랑 코바코 예산 비교',
    });

    expect(evaluate.mock.calls[1][0].searchHistory).toHaveLength(2);
    expect(evaluate.mock.calls[1][0].evaluationHistory).toEqual([
      { sufficient: false, missing: ['코바코 예산'], confidence: 0.5 },
    ]);
  });
});
