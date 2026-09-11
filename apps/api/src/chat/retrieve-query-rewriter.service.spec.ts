import { ConfigService } from '@nestjs/config';
import { ChatRole } from './dto/chat-message.dto';
import { RetrieveQueryRewriter } from './retrieve-query-rewriter.service';

const mockInvoke = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

describe('RetrieveQueryRewriter', () => {
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
  });

  it('returns the last user message without calling the LLM on the first turn', async () => {
    const rewriter = new RetrieveQueryRewriter(config);

    await expect(
      rewriter.rewrite([{ role: ChatRole.User, content: '핸드북?' }]),
    ).resolves.toBe('핸드북?');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('returns a standalone query from the rewrite LLM', async () => {
    mockInvoke.mockResolvedValue({ content: '직원 핸드북 연차 일수' });
    const rewriter = new RetrieveQueryRewriter(config);

    await expect(
      rewriter.rewrite([
        { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
        { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
        { role: ChatRole.User, content: '그건 며칠인가요?' },
      ]),
    ).resolves.toBe('직원 핸드북 연차 일수');
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('falls back to the last user message when rewrite fails', async () => {
    mockInvoke.mockRejectedValue(new Error('LLM down'));
    const rewriter = new RetrieveQueryRewriter(config);

    await expect(
      rewriter.rewrite([
        { role: ChatRole.User, content: '핸드북?' },
        { role: ChatRole.Assistant, content: '연차가 있습니다.' },
        { role: ChatRole.User, content: '며칠이야?' },
      ]),
    ).resolves.toBe('며칠이야?');
  });
});
