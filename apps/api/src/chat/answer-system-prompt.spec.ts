import { ChatRole } from './dto/chat-message.dto';
import {
  ANSWER_SYSTEM_PROMPT,
  withAnswerSystemPrompt,
} from './answer-system-prompt';

describe('withAnswerSystemPrompt', () => {
  it('prepends the answer system prompt', () => {
    expect(
      withAnswerSystemPrompt([{ role: ChatRole.User, content: '연차 며칠이야?' }]),
    ).toEqual([
      { role: ChatRole.System, content: ANSWER_SYSTEM_PROMPT },
      { role: ChatRole.User, content: '연차 며칠이야?' },
    ]);
  });

  it('does not duplicate the answer system prompt', () => {
    const messages = [
      { role: ChatRole.System, content: ANSWER_SYSTEM_PROMPT },
      { role: ChatRole.User, content: '연차 며칠이야?' },
    ];
    expect(withAnswerSystemPrompt(messages)).toEqual(messages);
  });

  it('merges a client system into one leading system message', () => {
    expect(
      withAnswerSystemPrompt([
        { role: ChatRole.System, content: 'Be brief.' },
        { role: ChatRole.User, content: 'Hi' },
      ]),
    ).toEqual([
      {
        role: ChatRole.System,
        content: `${ANSWER_SYSTEM_PROMPT}\n\nBe brief.`,
      },
      { role: ChatRole.User, content: 'Hi' },
    ]);
  });
});
