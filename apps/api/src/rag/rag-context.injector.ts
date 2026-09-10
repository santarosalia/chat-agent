import { ChatMessageDto, ChatRole } from '../chat/dto/chat-message.dto';

export function injectRetrievedContext(
  messages: ChatMessageDto[],
  contextBlock: string,
): ChatMessageDto[] {
  const contextMessage: ChatMessageDto = {
    role: ChatRole.System,
    content: contextBlock,
  };

  const systemIndex = messages.findIndex((m) => m.role === ChatRole.System);
  if (systemIndex >= 0) {
    return [
      ...messages.slice(0, systemIndex),
      contextMessage,
      ...messages.slice(systemIndex),
    ];
  }

  return [contextMessage, ...messages];
}
