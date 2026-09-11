import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import { LLM_INPUT_MAX_MESSAGES } from './context-truncate';
import { createChatGraph, ChatGraphDeps } from './chat.graph';
import { ChatRole } from './dto/chat-message.dto';
import { RetrieveQueryRewriter } from './retrieve-query-rewriter.service';

describe('createChatGraph', () => {
  const emptyRetrieval: RagRetrieveResult = {
    ragUsed: false,
    citations: [],
    contextBlock: null,
  };

  function createDeps(overrides: Partial<ChatGraphDeps> = {}): ChatGraphDeps {
    const ragClient = {
      retrieve: jest.fn().mockResolvedValue(emptyRetrieval),
    };
    const chatHistory = {
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    const queryRewriter = {
      rewrite: jest.fn(async (messages: Array<{ role: string; content: string }>) => {
        const last = [...messages]
          .reverse()
          .find((message) => message.role === ChatRole.User);
        return last?.content ?? '';
      }),
    };
    const model = {
      invoke: jest.fn().mockResolvedValue({ content: 'Assistant reply' }),
    };
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          VLLM_MODEL: 'test-model',
          VLLM_BASE_URL: 'http://llm.local/v1',
        };
        return values[key];
      },
    };

    return {
      model: model as unknown as ChatOpenAI,
      ragClient: ragClient as unknown as RagRetrieveClient,
      chatHistory: chatHistory as unknown as ChatHistoryService,
      queryRewriter: queryRewriter as unknown as RetrieveQueryRewriter,
      config: config as ConfigService,
      ...overrides,
    };
  }

  it('loads session history, rewrites the retrieve query, then calls the answer LLM', async () => {
    const deps = createDeps();
    (deps.chatHistory.listActiveMessages as jest.Mock).mockResolvedValue([
      { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
    ]);
    (deps.queryRewriter.rewrite as jest.Mock).mockResolvedValue(
      '직원 핸드북 연차 일수',
    );

    const graph = createChatGraph(deps);
    const result = await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: '그건 며칠인가요?' }],
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      topK: 5,
      historyEnabled: true,
    });

    expect(deps.chatHistory.listActiveMessages).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(deps.queryRewriter.rewrite).toHaveBeenCalledWith([
      { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
      { role: ChatRole.User, content: '그건 며칠인가요?' },
    ]);
    expect(deps.ragClient.retrieve).toHaveBeenCalledWith(
      '직원 핸드북 연차 일수',
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
      topK: 10,
      historyEnabled: false,
    });

    expect(deps.chatHistory.listActiveMessages).not.toHaveBeenCalled();
    expect(deps.ragClient.retrieve).toHaveBeenCalledWith('Hello', 'team-a', 10);
  });

  it('injects retrieved context and truncates before the answer LLM', async () => {
    const deps = createDeps();
    (deps.ragClient.retrieve as jest.Mock).mockResolvedValue({
      ragUsed: true,
      citations: [{ filename: 'doc.pdf', page: 1, snippet: 'info' }],
      contextBlock: '[Retrieved context]\n(doc.pdf p.1) info',
    });

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
      topK: 5,
      historyEnabled: false,
    });

    const llmMessages = (deps.model.invoke as jest.Mock).mock.calls[0][0];
    expect(llmMessages.length).toBeLessThanOrEqual(LLM_INPUT_MAX_MESSAGES);
    expect(llmMessages[0].content).toContain('[Retrieved context]');
    expect(llmMessages[llmMessages.length - 1].content).toBe(
      'retrieve and answer this',
    );
    expect(llmMessages.some((m: { content: string }) => m.content === 'history-0')).toBe(
      false,
    );
  });

  it('prepare-only graph stops after retrieve and does not call the answer LLM', async () => {
    const deps = createDeps();
    const graph = createChatGraph(deps, { includeLlm: false });

    const result = await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: 'Hi' }],
      topK: 5,
      historyEnabled: false,
    });

    expect(deps.ragClient.retrieve).toHaveBeenCalled();
    expect(deps.model.invoke).not.toHaveBeenCalled();
    expect(result.response).toBeUndefined();
    expect(result.truncatedMessages).toEqual([
      { role: ChatRole.User, content: 'Hi' },
    ]);
  });
});
