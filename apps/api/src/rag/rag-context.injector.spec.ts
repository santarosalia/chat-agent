import { ChatRole } from '../chat/dto/chat-message.dto';
import { injectRetrievedContext } from './rag-context.injector';

describe('injectRetrievedContext', () => {
  const contextBlock =
    '[Retrieved context]\n- (doc.pdf p.1) sample snippet';

  it('inserts context message before existing system message', () => {
    const messages = [
      { role: ChatRole.User, content: 'Hello' },
      { role: ChatRole.System, content: 'You are helpful.' },
      { role: ChatRole.User, content: 'Question?' },
    ];

    const result = injectRetrievedContext(messages, contextBlock);

    expect(result).toEqual([
      { role: ChatRole.User, content: 'Hello' },
      { role: ChatRole.System, content: contextBlock },
      { role: ChatRole.System, content: 'You are helpful.' },
      { role: ChatRole.User, content: 'Question?' },
    ]);
  });

  it('prepends context message when no system message exists', () => {
    const messages = [
      { role: ChatRole.User, content: 'Hello' },
      { role: ChatRole.Assistant, content: 'Hi' },
    ];

    const result = injectRetrievedContext(messages, contextBlock);

    expect(result[0]).toEqual({
      role: ChatRole.System,
      content: contextBlock,
    });
    expect(result).toHaveLength(3);
  });
});
