import { ChatMessageDto, ChatRole } from '../chat/dto/chat-message.dto';

export function injectRetrievedContext(
  messages: ChatMessageDto[],
  contextBlock: string,
): ChatMessageDto[] {
  const systemIndex = messages.findIndex((m) => m.role === ChatRole.System);
  if (systemIndex < 0) {
    return [{ role: ChatRole.System, content: contextBlock }, ...messages];
  }

  const existing = messages[systemIndex];
  const merged: ChatMessageDto = {
    role: ChatRole.System,
    content: `${existing.content}\n\n${contextBlock}`,
  };
  const withoutSystem = [
    ...messages.slice(0, systemIndex),
    ...messages.slice(systemIndex + 1),
  ];
  return [merged, ...withoutSystem];
}
