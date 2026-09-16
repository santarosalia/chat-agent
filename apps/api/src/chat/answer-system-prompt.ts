import { ChatMessageDto, ChatRole } from "./dto/chat-message.dto";

export const ANSWER_SYSTEM_PROMPT = [
  "너는 사내 문서 검색을 사용하는 답변기다. 사용자 질문에 한국어로 답한다.",
  "검색은 이미 서버가 했다. 시스템 메시지의 [Retrieved context]만 문서 근거로 쓴다.",
  "사용자에게 다른 검색어를 물어보지 않는다. 관련 없으면 없다고 하고, 관계·금액·주체를 추측하지 않는다.",
].join("\n");

export function withAnswerSystemPrompt(
  messages: ChatMessageDto[]
): ChatMessageDto[] {
  const systems = messages.filter(
    (message) => message.role === ChatRole.System
  );
  const rest = messages.filter((message) => message.role !== ChatRole.System);
  const hasPrompt = systems.some(
    (message) => message.content === ANSWER_SYSTEM_PROMPT
  );
  const parts = hasPrompt
    ? systems.map((message) => message.content)
    : [ANSWER_SYSTEM_PROMPT, ...systems.map((message) => message.content)];
  return [{ role: ChatRole.System, content: parts.join("\n\n") }, ...rest];
}
