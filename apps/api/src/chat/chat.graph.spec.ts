import { ChatOpenAI } from '@langchain/openai';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import { LLM_INPUT_MAX_MESSAGES } from './context-truncate';
import { createChatGraph, ChatGraphDeps } from './chat.graph';
import { ChatRole } from './dto/chat-message.dto';
import { ANSWER_SYSTEM_PROMPT } from './answer-system-prompt';
import { RetrieveSufficiencyEvaluatorPort } from './retrieve-evaluate-loop';

describe('createChatGraph', () => {
  const emptyRetrieval: RagRetrieveResult = {
    ragUsed: false,
    citations: [],
    contextBlock: null,
  };

  function sufficientEvaluator(): RetrieveSufficiencyEvaluatorPort {
    return {
      evaluate: jest.fn().mockResolvedValue({
        sufficient: true,
        missing: [],
        confidence: 1,
      }),
    };
  }

  function createDeps(overrides: Partial<ChatGraphDeps> = {}): ChatGraphDeps {
    const ragClient = {
      retrieve: jest.fn().mockResolvedValue(emptyRetrieval),
    };
    const chatHistory = {
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    const invoke = jest.fn().mockResolvedValue({ content: 'Assistant reply' });
    const model = { invoke, stream: jest.fn() };

    return {
      model: model as unknown as ChatOpenAI,
      ragClient: ragClient as unknown as RagRetrieveClient,
      chatHistory: chatHistory as unknown as ChatHistoryService,
      evaluator: sufficientEvaluator(),
      ...overrides,
    };
  }

  it('loads session history then retrieves with the last user query', async () => {
    const deps = createDeps();
    (deps.chatHistory.listActiveMessages as jest.Mock).mockResolvedValue([
      { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
    ]);

    const graph = createChatGraph(deps);
    const result = await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: '그건 며칠인가요?' }],
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      historyEnabled: true,
    });

    expect(deps.chatHistory.listActiveMessages).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(deps.ragClient.retrieve).toHaveBeenCalledWith(
      '그건 며칠인가요?',
      undefined,
      5,
    );
    expect(result.response).toBe('Assistant reply');
    expect(result.retrieval).toEqual(emptyRetrieval);
  });

  it('skips history load when history is disabled and uses request messages', async () => {
    const deps = createDeps();
    const graph = createChatGraph(deps);

    await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: 'Hello' }],
      groupId: 'team-a',
      historyEnabled: false,
    });

    expect(deps.chatHistory.listActiveMessages).not.toHaveBeenCalled();
    expect(deps.ragClient.retrieve).toHaveBeenCalledWith('Hello', 'team-a', 5);
  });

  it('keeps citations from the retrieve-evaluate loop', async () => {
    const deps = createDeps();
    (deps.ragClient.retrieve as jest.Mock).mockResolvedValue({
      ragUsed: true,
      citations: [{ filename: 'doc.pdf', page: 1, snippet: '연차 15일' }],
      contextBlock: '[Retrieved context]\n- (doc.pdf p.1) 연차 15일',
    });

    const graph = createChatGraph(deps);
    const result = await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: '연차 며칠이야?' }],
      groupId: 'team-a',
      historyEnabled: false,
    });

    expect(deps.ragClient.retrieve).toHaveBeenCalledWith(
      '연차 며칠이야?',
      'team-a',
      5,
    );
    expect(result.response).toBe('Assistant reply');
    expect(result.retrieval.ragUsed).toBe(true);
  });

  it('truncates conversation before the answer LLM', async () => {
    const deps = createDeps();
    const droppable = Array.from({ length: LLM_INPUT_MAX_MESSAGES }, (_, i) => ({
      role: ChatRole.Assistant,
      content: `history-${i}`,
    }));

    const graph = createChatGraph(deps);
    await graph.invoke({
      requestMessages: [
        ...droppable,
        { role: ChatRole.User, content: 'retrieve and answer this' },
      ],
      historyEnabled: false,
    });

    const invoke = deps.model.invoke as jest.Mock;
    const llmMessages = invoke.mock.calls[0][0];
    expect(llmMessages.length).toBeLessThanOrEqual(LLM_INPUT_MAX_MESSAGES);
    expect(llmMessages[0].content).toContain(ANSWER_SYSTEM_PROMPT);
    expect(llmMessages[0].content).not.toContain('(doc.pdf');
    expect(llmMessages[llmMessages.length - 1].content).toBe(
      'retrieve and answer this',
    );
    expect(
      llmMessages.some((m: { content: string }) => m.content === 'history-0'),
    ).toBe(false);
  });

  it('streams answer tokens from the llm node when callbacks are provided', async () => {
    async function* tokenStream() {
      yield { content: 'Hel' };
      yield { content: 'lo' };
    }
    const deps = createDeps();
    (deps.model as unknown as { stream: jest.Mock }).stream = jest
      .fn()
      .mockResolvedValue(tokenStream());

    const onMeta = jest.fn();
    const onDelta = jest.fn();
    const graph = createChatGraph(deps);
    const result = await graph.invoke(
      {
        requestMessages: [{ role: ChatRole.User, content: 'Hi' }],
        historyEnabled: false,
      },
      { configurable: { onMeta, onDelta } },
    );

    expect(onMeta).toHaveBeenCalledWith(emptyRetrieval);
    expect(onDelta.mock.calls.map((call) => call[0])).toEqual(['Hel', 'lo']);
    expect(result.response).toBe('Hello');
    expect(deps.model.invoke).not.toHaveBeenCalled();
  });
});
