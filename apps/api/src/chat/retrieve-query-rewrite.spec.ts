import { ChatRole } from './dto/chat-message.dto';
import {
  formatRewriteUserPrompt,
  parseRewrittenQuery,
  selectRewriteContext,
  shouldRewriteRetrieveQuery,
} from './retrieve-query-rewrite';

describe('shouldRewriteRetrieveQuery', () => {
  it('skips rewrite for a first-turn user message', () => {
    expect(
      shouldRewriteRetrieveQuery([{ role: ChatRole.User, content: '핸드북?' }]),
    ).toBe(false);
  });

  it('rewrites when prior turns exist so pronouns can be resolved', () => {
    expect(
      shouldRewriteRetrieveQuery([
        { role: ChatRole.User, content: '직원 핸드북에는 무엇이 있나요?' },
        { role: ChatRole.Assistant, content: '연차와 복무가 있습니다.' },
        { role: ChatRole.User, content: '그건 며칠인가요?' },
      ]),
    ).toBe(true);
  });
});

describe('selectRewriteContext', () => {
  it('keeps the last six messages and truncates long assistant text', () => {
    const messages = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 === 0 ? ChatRole.User : ChatRole.Assistant,
      content: i % 2 === 0 ? `u${i}` : 'a'.repeat(500),
    }));

    const context = selectRewriteContext(messages);

    expect(context).toHaveLength(6);
    expect(context[0].content).toBe('u2');
    expect(
      context.filter((m) => m.role === ChatRole.Assistant).every(
        (m) => m.content.length === 400,
      ),
    ).toBe(true);
  });
});

describe('parseRewrittenQuery', () => {
  it('takes the first line and strips wrapping quotes', () => {
    expect(parseRewrittenQuery('"직원 핸드북 연차 일수"\nextra', 'fallback')).toBe(
      '직원 핸드북 연차 일수',
    );
  });

  it('falls back when the model returns empty text', () => {
    expect(parseRewrittenQuery('   ', '그건 며칠인가요?')).toBe(
      '그건 며칠인가요?',
    );
  });
});

describe('formatRewriteUserPrompt', () => {
  it('includes user and assistant turns and asks for a standalone search query', () => {
    const prompt = formatRewriteUserPrompt([
      { role: ChatRole.User, content: '핸드북?' },
      { role: ChatRole.Assistant, content: '연차 규정이 있습니다.' },
      { role: ChatRole.User, content: '며칠이야?' },
    ]);

    expect(prompt).toContain('user: 핸드북?');
    expect(prompt).toContain('assistant: 연차 규정이 있습니다.');
    expect(prompt).toContain('user: 며칠이야?');
    expect(prompt).toContain('독립 질문');
  });
});
