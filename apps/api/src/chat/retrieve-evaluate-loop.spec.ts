import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import {
  routeAfterEvaluate,
  runEvaluateRound,
  runRetrieveRound,
} from './retrieve-evaluate-loop';
import { SufficiencyEvaluation } from './retrieve-sufficiency';

describe('runRetrieveRound', () => {
  const emptyRetrieval = {
    ragUsed: false,
    citations: [],
    contextBlock: null,
  };

  it('retrieves with top_k 5 and the user query on the first round', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      ragUsed: true,
      citations: [{ filename: 'a.pdf', page: 1, snippet: '연차 15일' }],
      contextBlock: '[Retrieved context]\n- (a.pdf p.1) 연차 15일',
    });

    const result = await runRetrieveRound({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      question: '연차 며칠이야?',
      groupId: 'team-a',
      retrieval: emptyRetrieval,
      searchHistory: [],
      evaluationHistory: [],
    });

    expect(retrieve).toHaveBeenCalledWith('연차 며칠이야?', 'team-a', 5);
    expect(result.retrieval.ragUsed).toBe(true);
    expect(result.searchHistory).toEqual([
      { query: '연차 며칠이야?', topK: 5, ragUsed: true, citationCount: 1 },
    ]);
  });

  it('retrieves with missing query and top_k 10 on the second round', async () => {
    const retrieve = jest.fn().mockResolvedValue(emptyRetrieval);

    await runRetrieveRound({
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      question: '규정 B는 언제 적용돼?',
      retrieval: emptyRetrieval,
      searchHistory: [
        {
          query: '규정 B는 언제 적용돼?',
          topK: 5,
          ragUsed: false,
          citationCount: 0,
        },
      ],
      evaluationHistory: [
        {
          sufficient: false,
          missing: ['B의 적용 조건', 'B의 예외 사항'],
          confidence: 0.72,
        },
      ],
    });

    expect(retrieve).toHaveBeenCalledWith(
      'B의 적용 조건 B의 예외 사항',
      undefined,
      10,
    );
  });
});

describe('runEvaluateRound', () => {
  it('appends evaluation history without mutating prior rounds', async () => {
    const previous: SufficiencyEvaluation = {
      sufficient: false,
      missing: ['코바코 예산'],
      confidence: 0.5,
    };
    const evaluate = jest.fn().mockResolvedValue({
      sufficient: true,
      missing: [],
      confidence: 0.8,
    } satisfies SufficiencyEvaluation);

    const result = await runEvaluateRound({
      evaluator: { evaluate },
      question: '아이작이랑 코바코 예산 비교',
      retrieval: { ragUsed: false, citations: [], contextBlock: null },
      searchHistory: [
        {
          query: '아이작이랑 코바코 예산 비교',
          topK: 5,
          ragUsed: false,
          citationCount: 0,
        },
        { query: '코바코 예산', topK: 10, ragUsed: false, citationCount: 0 },
      ],
      evaluationHistory: [previous],
    });

    expect(evaluate.mock.calls[0][0].searchHistory).toHaveLength(2);
    expect(evaluate.mock.calls[0][0].evaluationHistory).toEqual([previous]);
    expect(result.evaluationHistory).toEqual([
      previous,
      { sufficient: true, missing: [], confidence: 0.8 },
    ]);
  });
});

describe('routeAfterEvaluate', () => {
  it('goes back to retrieve when insufficient and under the round cap', () => {
    expect(
      routeAfterEvaluate({
        searchHistory: [{ query: 'q', topK: 5, ragUsed: false, citationCount: 0 }],
        evaluationHistory: [
          { sufficient: false, missing: ['더'], confidence: 0.2 },
        ],
      }),
    ).toBe('retrieve');
  });

  it('goes to answer when sufficient or the round cap is reached', () => {
    expect(
      routeAfterEvaluate({
        searchHistory: [{ query: 'q', topK: 5, ragUsed: false, citationCount: 0 }],
        evaluationHistory: [
          { sufficient: true, missing: [], confidence: 0.9 },
        ],
      }),
    ).toBe('answer');
    expect(
      routeAfterEvaluate({
        searchHistory: [
          { query: 'q', topK: 5, ragUsed: false, citationCount: 0 },
          { query: 'q', topK: 10, ragUsed: false, citationCount: 0 },
          { query: 'q', topK: 20, ragUsed: false, citationCount: 0 },
        ],
        evaluationHistory: [
          { sufficient: false, missing: ['더'], confidence: 0.2 },
        ],
      }),
    ).toBe('answer');
  });
});
