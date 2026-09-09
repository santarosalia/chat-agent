import { ConfigService } from '@nestjs/config';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { ChatService, getLastUserMessageContent } from './chat.service';
import { ChatRole } from './dto/chat-message.dto';

jest.mock('./chat.graph', () => ({
  createChatGraph: jest.fn(() => ({
    invoke: jest.fn().mockResolvedValue({ response: 'Assistant reply' }),
  })),
  toLangChainMessages: jest.fn((messages) => messages),
}));

describe('getLastUserMessageContent', () => {
  it('returns content of the last user message', () => {
    const content = getLastUserMessageContent([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'middle' },
      { role: 'user', content: 'last question' },
    ]);
    expect(content).toBe('last question');
  });

  it('falls back to last message when no user role exists', () => {
    const content = getLastUserMessageContent([
      { role: 'assistant', content: 'only assistant' },
    ]);
    expect(content).toBe('only assistant');
  });
});

describe('ChatService', () => {
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        OPENAI_API_KEY: 'test-key',
        OPENAI_BASE_URL: 'http://llm.local/v1',
        OPENAI_MODEL: 'test-model',
      };
      return values[key];
    },
  } as ConfigService;

  it('returns rag_used true with citations when retrieval succeeds', async () => {
    const ragClient = {
      retrieve: jest.fn().mockResolvedValue({
        ragUsed: true,
        citations: [{ filename: 'doc.pdf', page: 1, snippet: 'info' }],
        contextBlock: '[Retrieved context]\n- (doc.pdf p.1) info',
      }),
    } as unknown as RagRetrieveClient;

    const service = new ChatService(config, ragClient);
    const response = await service.chat({
      messages: [{ role: ChatRole.User, content: 'What is NestJS?' }],
    });

    expect(ragClient.retrieve).toHaveBeenCalledWith('What is NestJS?', undefined);
    expect(response).toEqual({
      message: { role: 'assistant', content: 'Assistant reply' },
      rag_used: true,
      citations: [{ filename: 'doc.pdf', page: 1, snippet: 'info' }],
    });
  });

  it('returns rag_used false without citations when retrieval is skipped', async () => {
    const ragClient = {
      retrieve: jest.fn().mockResolvedValue({
        ragUsed: false,
        citations: [],
        contextBlock: null,
      }),
    } as unknown as RagRetrieveClient;

    const service = new ChatService(config, ragClient);
    const response = await service.chat({
      messages: [{ role: ChatRole.User, content: 'Hello' }],
      group_id: 'team-a',
    });

    expect(ragClient.retrieve).toHaveBeenCalledWith('Hello', 'team-a');
    expect(response).toEqual({
      message: { role: 'assistant', content: 'Assistant reply' },
      rag_used: false,
    });
    expect(response.citations).toBeUndefined();
  });
});
