import { ChatMessageDto, ChatRole } from "./dto/chat-message.dto";

export const ANSWER_SYSTEM_PROMPT = [
  "너는 사내 문서 검색을 쓰는 답변기다. 사용자 질문에 한국어로 답한다.",
  "[Retrieved context]가 질문과 관련이 있으면 근거로 답한다.",
  "질문과 관련 없는 검색 결과는 쓰지 않는다. 없으면 문서에 없다고 한다.",
  "[Retrieved context]가 없으면 일반 지식이나 대화만으로 답하고, 문서를 본 척하지 않는다.",
  "추측이면 추측이라고 밝힌다.",
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
