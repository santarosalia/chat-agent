import { ChatMessageDto, ChatRole } from './dto/chat-message.dto';

/** v1 LLM input cap (message count). See ADR 0004. */
export const LLM_INPUT_MAX_MESSAGES = 20;

export const RAG_CONTEXT_BLOCK_PREFIX = '[Retrieved context]';

export function isRagInjectBlock(content: string): boolean {
  return content.startsWith(RAG_CONTEXT_BLOCK_PREFIX);
}

function findLastUserIndex(messages: ChatMessageDto[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return i;
    }
  }
  return -1;
}

function isAlwaysKept(
  message: ChatMessageDto,
  index: number,
  lastUserIndex: number,
): boolean {
  if (message.role === ChatRole.System || isRagInjectBlock(message.content)) {
    return true;
  }
  return index === lastUserIndex;
}

/**
 * Truncates messages for LLM input after RAG inject. Drops oldest droppable
 * messages from the front until count ≤ maxMessages. Does not summarize.
 */
export function truncateMessagesForLlm(
  messages: ChatMessageDto[],
  maxMessages: number = LLM_INPUT_MAX_MESSAGES,
): ChatMessageDto[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const lastUserIndex = findLastUserIndex(messages);
  const droppableIndices: number[] = [];

  for (let i = 0; i < messages.length; i += 1) {
    if (!isAlwaysKept(messages[i], i, lastUserIndex)) {
      droppableIndices.push(i);
    }
  }

  const dropCount = messages.length - maxMessages;
  const dropSet = new Set(droppableIndices.slice(0, dropCount));

  return messages.filter((_, index) => !dropSet.has(index));
}
