export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Citation {
  filename: string;
  page: number;
  snippet: string;
}

export interface ChatResponse {
  message: { role: 'assistant'; content: string };
  rag_used: boolean;
  citations?: Citation[];
}

export interface StreamHandlers {
  onMeta?: (data: { rag_used: boolean; citations?: Citation[] }) => void;
  onDelta?: (content: string) => void;
  onDone?: (data: ChatResponse) => void;
  onError?: (message: string) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface ChatRequestBody {
  messages: ChatMessage[];
  group_id?: string;
  top_k?: number;
}

export async function postChat(body: ChatRequestBody): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<ChatResponse>;
}

export async function postChatStream(
  body: ChatRequestBody,
  handlers: StreamHandlers,
): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming response body is missing');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSseBuffer(buffer, handlers);
  }

  consumeSseBuffer(`${buffer}\n\n`, handlers);
}

function consumeSseBuffer(buffer: string, handlers: StreamHandlers): string {
  const blocks = buffer.split('\n\n');
  const remainder = blocks.pop() ?? '';

  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }
    parseSseBlock(block, handlers);
  }

  return remainder;
}

function parseSseBlock(block: string, handlers: StreamHandlers): void {
  const lines = block.split('\n');
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>;

  switch (event) {
    case 'meta':
      handlers.onMeta?.({
        rag_used: Boolean(payload.rag_used),
        citations: payload.citations as Citation[] | undefined,
      });
      break;
    case 'delta':
      handlers.onDelta?.(String(payload.content ?? ''));
      break;
    case 'done':
      handlers.onDone?.(payload as unknown as ChatResponse);
      break;
    case 'error':
      handlers.onError?.(String(payload.message ?? 'Unknown stream error'));
      break;
    default:
      break;
  }
}
