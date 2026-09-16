import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { runAnswerWithRetrieveTool } from './answer-with-retrieve-tool';

describe('runAnswerWithRetrieveTool', () => {
  const citations = [
    { filename: 'doc.pdf', page: 1, snippet: '연차 15일', score: 0.5 },
  ];
  const retrieval = {
    ragUsed: true,
    citations,
    contextBlock: '[Retrieved context]\n- (doc.pdf p.1) 연차 15일',
  };

  it('answers from already retrieved context', async () => {
    const invoke = jest.fn().mockResolvedValue({
      content: '문서에 따르면 15일입니다.',
    });

    const result = await runAnswerWithRetrieveTool({
      model: { invoke } as never,
      messages: [
        new SystemMessage('policy'),
        new HumanMessage('연차 며칠이야?'),
      ],
      retrieval,
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('문서에 따르면 15일입니다.');
    expect(result.retrieval.citations).toEqual(citations);
  });

  it('injects retrieved context into the answer LLM input', async () => {
    const invoke = jest.fn().mockResolvedValue({ content: '15일입니다.' });

    await runAnswerWithRetrieveTool({
      model: { invoke } as never,
      messages: [
        new SystemMessage('policy'),
        new HumanMessage('연차 며칠이야?'),
      ],
      retrieval,
    });

    const llmMessages = invoke.mock.calls[0][0] as Array<{ content: string }>;
    expect(llmMessages[0].content).toContain('[Retrieved context]');
    expect(llmMessages[0].content).toContain('연차 15일');
  });
});
