import { ChatMessageDto, ChatRole } from './dto/chat-message.dto';

export const REWRITE_MAX_MESSAGES = 6;
export const REWRITE_ASSISTANT_MAX_CHARS = 400;

export function shouldRewriteRetrieveQuery(
  messages: ChatMessageDto[],
): boolean {
  const turns = messages.filter(
    (message) =>
      message.role === ChatRole.User || message.role === ChatRole.Assistant,
  );
  return turns.length >= 2 && messages.some((m) => m.role === ChatRole.User);
}

export function selectRewriteContext(
  messages: ChatMessageDto[],
): ChatMessageDto[] {
  return messages.slice(-REWRITE_MAX_MESSAGES).map((message) => {
    if (
      message.role === ChatRole.Assistant &&
      message.content.length > REWRITE_ASSISTANT_MAX_CHARS
    ) {
      return {
        ...message,
        content: message.content.slice(0, REWRITE_ASSISTANT_MAX_CHARS),
      };
    }
    return message;
  });
}

export function formatRewriteUserPrompt(messages: ChatMessageDto[]): string {
  const lines = selectRewriteContext(messages).map(
    (message) => `${message.role}: ${message.content}`,
  );
  return [
    '대화:',
    lines.join('\n\n'),
    '',
    '위 대화를 문서 검색(hybrid dense/sparse)용 독립 질문 한 줄로 바꿔라.',
    '답변하지 마라. 설명하지 마라. 따옴표 없이 검색 질문만 출력하라.',
  ].join('\n');
}

export function lastUserContentForRewrite(messages: ChatMessageDto[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return messages[i].content;
    }
  }
  return messages[messages.length - 1]?.content ?? '';
}

export function parseRewrittenQuery(content: string, fallback: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('<'));
  if (!firstLine) {
    return fallback;
  }
  return firstLine.replace(/^["'`]+|["'`]+$/g, '').trim() || fallback;
}
