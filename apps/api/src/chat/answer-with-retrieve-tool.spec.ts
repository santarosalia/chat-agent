import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { runAnswerWithRetrieveTool } from './answer-with-retrieve-tool';
import { RetrieveSufficiencyEvaluatorPort } from './retrieve-evaluate-loop';

describe('runAnswerWithRetrieveTool', () => {
  const citations = [
    { filename: 'doc.pdf', page: 1, snippet: '연차 15일', score: 0.5 },
  ];
  const retrieval = {
    ragUsed: true,
    citations,
    contextBlock: '[Retrieved context]\n- (doc.pdf p.1) 연차 15일',
  };

  it('retrieves then answers when the evaluator says sufficient', async () => {
    const retrieve = jest.fn().mockResolvedValue(retrieval);
    const evaluate = jest.fn().mockResolvedValue({
      sufficient: true,
      missing: [],
      confidence: 0.9,
    });
    const invoke = jest.fn().mockResolvedValue({
      content: '문서에 따르면 15일입니다.',
    });

    const result = await runAnswerWithRetrieveTool({
      model: { invoke } as never,
      evaluator: { evaluate } as RetrieveSufficiencyEvaluatorPort,
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      messages: [
        new SystemMessage('policy'),
        new HumanMessage('연차 며칠이야?'),
      ],
      groupId: 'team-a',
    });

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('연차 며칠이야?', 'team-a', 5);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('문서에 따르면 15일입니다.');
    expect(result.retrieval.citations).toEqual(citations);
  });

  it('retrieves again with missing items and top_k 10 before answering', async () => {
    const retrieve = jest.fn().mockResolvedValue(retrieval);
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
        confidence: 0.9,
      });
    const invoke = jest.fn().mockResolvedValue({ content: '조건이 있습니다.' });

    await runAnswerWithRetrieveTool({
      model: { invoke } as never,
      evaluator: { evaluate } as RetrieveSufficiencyEvaluatorPort,
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      messages: [new HumanMessage('규정 B는 언제 적용돼?')],
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
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('injects retrieved context into the answer LLM input', async () => {
    const retrieve = jest.fn().mockResolvedValue(retrieval);
    const evaluate = jest.fn().mockResolvedValue({
      sufficient: true,
      missing: [],
      confidence: 1,
    });
    const invoke = jest.fn().mockResolvedValue({ content: '15일입니다.' });

    await runAnswerWithRetrieveTool({
      model: { invoke } as never,
      evaluator: { evaluate } as RetrieveSufficiencyEvaluatorPort,
      ragClient: { retrieve } as unknown as RagRetrieveClient,
      messages: [
        new SystemMessage('policy'),
        new HumanMessage('연차 며칠이야?'),
      ],
      groupId: 'team-a',
    });

    const llmMessages = invoke.mock.calls[0][0] as Array<{ content: string }>;
    expect(llmMessages[0].content).toContain('[Retrieved context]');
    expect(llmMessages[0].content).toContain('연차 15일');
  });
});
