import { RagCitation } from '../rag/rag.types';
import { ChatResponseMessage } from './dto/chat-response.dto';

export type SseEventName = 'meta' | 'delta' | 'done' | 'error';

export interface SseMetaPayload {
  rag_used: boolean;
  citations?: RagCitation[];
}

export interface SseDeltaPayload {
  content: string;
}

/** Completion signal only — RAG fields live in `meta`. */
export interface SseDonePayload {
  message?: ChatResponseMessage;
}

export interface SseErrorPayload {
  message: string;
}

export type SsePayload =
  | SseMetaPayload
  | SseDeltaPayload
  | SseDonePayload
  | SseErrorPayload;

export function formatSseEvent(
  event: SseEventName,
  data: SsePayload,
): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function chunkString(text: string, chunkSize: number): string[] {
  if (chunkSize <= 0 || text.length === 0) {
    return text.length === 0 ? [] : [text];
  }
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export function extractStreamChunkContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  if (content === null || content === undefined) {
    return '';
  }
  return String(content);
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}
