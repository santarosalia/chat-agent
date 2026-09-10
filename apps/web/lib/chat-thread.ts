import type { ChatMessage, ChatRequestBody, Citation } from './chat-api';

export type ThreadMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ragUsed?: boolean;
  citations?: Citation[];
  streaming?: boolean;
  error?: string;
};

export function toChatRequestMessages(thread: ThreadMessage[]): ChatMessage[] {
  return thread
    .filter((message) => {
      if (message.error) {
        return false;
      }
      if (message.streaming && message.content.length === 0) {
        return false;
      }
      return message.role === 'user' || message.content.length > 0;
    })
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export function buildChatRequest(
  thread: ThreadMessage[],
  options: {
    groupId: string;
    topK: string;
    sessionId?: string;
    userId?: string;
  },
): ChatRequestBody {
  const body: ChatRequestBody = {
    messages: toChatRequestMessages(thread),
  };

  if (options.groupId.trim()) {
    body.group_id = options.groupId.trim();
  }

  const parsedTopK = Number(options.topK);
  if (options.topK.trim() && Number.isInteger(parsedTopK) && parsedTopK >= 1) {
    body.top_k = parsedTopK;
  }

  if (options.sessionId?.trim()) {
    body.session_id = options.sessionId.trim();
  }

  if (options.userId?.trim()) {
    body.user_id = options.userId.trim();
  }

  return body;
}
