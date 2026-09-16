import { formatContextBlock } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import {
  mergeRetrievals,
  nextRetrieveQuery,
  parseSufficiencyEvaluation,
} from './retrieve-sufficiency';

describe('parseSufficiencyEvaluation', () => {
  it('parses the evaluator JSON object', () => {
    expect(
      parseSufficiencyEvaluation(
        '{ "sufficient": false, "missing": [ "B의 적용 조건", "B의 예외 사항" ], "confidence": 0.72 }',
      ),
    ).toEqual({
      sufficient: false,
      missing: ['B의 적용 조건', 'B의 예외 사항'],
      confidence: 0.72,
    });
  });

  it('returns insufficient fallback when JSON is missing', () => {
    expect(parseSufficiencyEvaluation('Assistant reply')).toEqual({
      sufficient: false,
      missing: [],
      confidence: 0,
    });
  });
});

describe('nextRetrieveQuery', () => {
  it('joins missing items for the next retrieve', () => {
    expect(
      nextRetrieveQuery('규정 B는 언제 적용돼?', {
        sufficient: false,
        missing: ['B의 적용 조건', 'B의 예외 사항'],
        confidence: 0.72,
      }),
    ).toBe('B의 적용 조건 B의 예외 사항');
  });

  it('falls back to the user question when missing is empty', () => {
    expect(
      nextRetrieveQuery('규정 B는 언제 적용돼?', {
        sufficient: false,
        missing: [],
        confidence: 0.4,
      }),
    ).toBe('규정 B는 언제 적용돼?');
  });
});

describe('mergeRetrievals', () => {
  it('accumulates unique citations across rounds', () => {
    const first: RagRetrieveResult = {
      ragUsed: true,
      citations: [
        { filename: 'a.pdf', page: 1, snippet: 'A', score: 0.9 },
      ],
      contextBlock: '[Retrieved context]\n- (a.pdf p.1) A',
    };
    const second: RagRetrieveResult = {
      ragUsed: true,
      citations: [
        { filename: 'a.pdf', page: 1, snippet: 'A', score: 0.9 },
        { filename: 'b.pdf', page: 2, snippet: 'B', score: 0.8 },
      ],
      contextBlock: '[Retrieved context]\n- (a.pdf p.1) A\n- (b.pdf p.2) B',
    };

    expect(mergeRetrievals(first, second)).toEqual({
      ragUsed: true,
      citations: [
        { filename: 'a.pdf', page: 1, snippet: 'A', score: 0.9 },
        { filename: 'b.pdf', page: 2, snippet: 'B', score: 0.8 },
      ],
      contextBlock: formatContextBlock([
        { filename: 'a.pdf', page: 1, snippet: 'A', score: 0.9 },
        { filename: 'b.pdf', page: 2, snippet: 'B', score: 0.8 },
      ]),
    });
  });
});
