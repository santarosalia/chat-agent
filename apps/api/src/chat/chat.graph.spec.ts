import { ChatHistoryService } from '../chat-history/chat-history.service';
import { LLM_INPUT_MAX_MESSAGES } from './context-truncate';
import { createChatGraph, ChatGraphDeps } from './chat.graph';
import { ChatRole } from './dto/chat-message.dto';
import { ANSWER_SYSTEM_PROMPT } from './answer-system-prompt';

describe('createChatGraph', () => {
  function createDeps(overrides: Partial<ChatGraphDeps> = {}): ChatGraphDeps {
    const chatHistory = {
      listActiveMessages: jest.fn().mockResolvedValue([]),
    };
    return {
      chatHistory: chatHistory as unknown as ChatHistoryService,
      ...overrides,
    };
  }

  it('loads session history then stops before retrieve', async () => {
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
    expect(result.truncatedMessages).toEqual([
      { role: ChatRole.System, content: ANSWER_SYSTEM_PROMPT },
      { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
      { role: ChatRole.User, content: '그건 며칠인가요?' },
    ]);
  });

  it('skips history load when history is disabled and uses request messages', async () => {
    const deps = createDeps();
    const graph = createChatGraph(deps);

    const result = await graph.invoke({
      requestMessages: [{ role: ChatRole.User, content: 'Hello' }],
      groupId: 'team-a',
      historyEnabled: false,
    });

    expect(deps.chatHistory.listActiveMessages).not.toHaveBeenCalled();
    expect(result.truncatedMessages).toEqual([
      { role: ChatRole.System, content: ANSWER_SYSTEM_PROMPT },
      { role: ChatRole.User, content: 'Hello' },
    ]);
  });

  it('truncates conversation and does not retrieve or answer', async () => {
    const deps = createDeps();
    const droppable = Array.from({ length: LLM_INPUT_MAX_MESSAGES }, (_, i) => ({
      role: ChatRole.Assistant,
      content: `history-${i}`,
    }));

    const graph = createChatGraph(deps);
    const result = await graph.invoke({
      requestMessages: [
        ...droppable,
        { role: ChatRole.User, content: 'retrieve and answer this' },
      ],
      historyEnabled: false,
    });

    expect(result.truncatedMessages.length).toBeLessThanOrEqual(
      LLM_INPUT_MAX_MESSAGES,
    );
    expect(result.truncatedMessages[0].content).toContain(ANSWER_SYSTEM_PROMPT);
    expect(
      result.truncatedMessages[result.truncatedMessages.length - 1].content,
    ).toBe('retrieve and answer this');
    expect(
      result.truncatedMessages.some((m) => m.content === 'history-0'),
    ).toBe(false);
  });
});
