import { ChatRole } from './dto/chat-message.dto';
import {
  LLM_INPUT_MAX_MESSAGES,
  RAG_CONTEXT_BLOCK_PREFIX,
  truncateMessagesForLlm,
} from './context-truncate';

const ragBlock = `${RAG_CONTEXT_BLOCK_PREFIX}\n- (doc.pdf p.1) snippet`;

function user(content: string) {
  return { role: ChatRole.User, content };
}

function assistant(content: string) {
  return { role: ChatRole.Assistant, content };
}

function system(content: string) {
  return { role: ChatRole.System, content };
}

describe('truncateMessagesForLlm', () => {
  it('returns messages unchanged when count is at or below N', () => {
    const messages = [user('hello'), assistant('hi')];
    expect(truncateMessagesForLlm(messages)).toBe(messages);
    expect(truncateMessagesForLlm(messages, LLM_INPUT_MAX_MESSAGES)).toBe(
      messages,
    );
  });

  it('keeps all system messages, RAG inject block, and the last user message', () => {
    const messages = [
      user('old user 1'),
      assistant('old assistant 1'),
      system('You are helpful.'),
      user('old user 2'),
      assistant('old assistant 2'),
      system(ragBlock),
      user('latest question'),
    ];

    // Pad with droppable assistant turns until we exceed N.
    const padded = [...messages];
    while (padded.length <= LLM_INPUT_MAX_MESSAGES) {
      padded.unshift(assistant(`droppable ${padded.length}`));
    }

    const result = truncateMessagesForLlm(padded);

    expect(result.some((m) => m.content === 'You are helpful.')).toBe(true);
    expect(result.some((m) => m.content === ragBlock)).toBe(true);
    expect(result[result.length - 1]).toEqual(user('latest question'));
    expect(result.length).toBeLessThanOrEqual(LLM_INPUT_MAX_MESSAGES);
  });

  it('drops oldest droppable messages from the front first', () => {
    const droppable = Array.from({ length: 18 }, (_, i) =>
      assistant(`drop-${i}`),
    );
    const messages = [
      ...droppable,
      system('system prompt'),
      user('old user'),
      assistant('recent'),
      user('last user'),
    ];

    expect(messages.length).toBe(22);

    const result = truncateMessagesForLlm(messages);

    expect(result.length).toBe(LLM_INPUT_MAX_MESSAGES);
    expect(result[0].content).toBe('drop-2');
    expect(result.some((m) => m.content === 'drop-0')).toBe(false);
    expect(result.some((m) => m.content === 'drop-1')).toBe(false);
    expect(result.some((m) => m.content === 'system prompt')).toBe(true);
    expect(result[result.length - 1]).toEqual(user('last user'));
  });

  it('uses N=20 by default', () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      assistant(`msg-${i}`),
    );
    messages.push(user('final'));

    const result = truncateMessagesForLlm(messages);

    expect(result.length).toBe(20);
    expect(result[result.length - 1]).toEqual(user('final'));
    expect(result[0].content).toBe('msg-6');
  });

  it('may exceed N when always-kept messages alone surpass the cap', () => {
    const systems = Array.from({ length: 22 }, (_, i) =>
      system(`sys-${i}`),
    );
    const messages = [...systems, user('last')];

    const result = truncateMessagesForLlm(messages);

    expect(result.length).toBe(23);
    expect(result[result.length - 1]).toEqual(user('last'));
  });
});
