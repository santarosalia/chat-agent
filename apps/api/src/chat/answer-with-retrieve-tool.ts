import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { RagRetrieveResult } from '../rag/rag.types';
import {
  chunkString,
  extractStreamChunkContent,
  isAbortError,
} from './sse';

const STREAM_FALLBACK_CHUNK_SIZE = 32;

type BoundLlm = Pick<ChatOpenAI, 'invoke' | 'stream'>;

export async function runAnswerWithRetrieveTool(input: {
  model: Pick<ChatOpenAI, 'invoke'>;
  messages: BaseMessage[];
  retrieval: RagRetrieveResult;
  signal?: AbortSignal;
}): Promise<{ content: string; retrieval: RagRetrieveResult }> {
  const result = await input.model.invoke(
    withRetrievedContext(input.messages, input.retrieval),
    { signal: input.signal },
  );
  return {
    content: contentToText(toAIMessage(result).content),
    retrieval: input.retrieval,
  };
}

export async function streamAnswerWithRetrieveTool(input: {
  model: Pick<ChatOpenAI, 'invoke' | 'stream'>;
  messages: BaseMessage[];
  retrieval: RagRetrieveResult;
  signal?: AbortSignal;
  onMeta: (retrieval: RagRetrieveResult) => void;
  onDelta: (content: string) => void;
}): Promise<{ content: string; retrieval: RagRetrieveResult }> {
  const answerMessages = withRetrievedContext(input.messages, input.retrieval);
  let metaSent = false;
  const sendMeta = () => {
    if (metaSent) {
      return;
    }
    input.onMeta(input.retrieval);
    metaSent = true;
  };

  let emittedLive = false;
  const { pieces } = await collectLlmRound(
    input.model,
    answerMessages,
    input.signal,
    (content) => {
      emittedLive = true;
      sendMeta();
      input.onDelta(content);
    },
  );
  if (!emittedLive) {
    sendMeta();
    for (const piece of pieces) {
      if (input.signal?.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }
      input.onDelta(piece);
    }
  }
  return { content: pieces.join(''), retrieval: input.retrieval };
}

export function withRetrievedContext(
  messages: BaseMessage[],
  retrieval: RagRetrieveResult,
): BaseMessage[] {
  const block = retrieval.contextBlock;
  if (!block) {
    return [...messages];
  }
  if (messages[0] instanceof SystemMessage) {
    return [
      new SystemMessage(`${contentToText(messages[0].content)}\n\n${block}`),
      ...messages.slice(1),
    ];
  }
  return [new SystemMessage(block), ...messages];
}

async function collectLlmRound(
  model: BoundLlm,
  messages: BaseMessage[],
  signal: AbortSignal | undefined,
  onAnswerToken?: (content: string) => void,
): Promise<{ aiMessage: AIMessage; pieces: string[] }> {
  let anyDeltaEmitted = false;
  try {
    if (typeof model.stream === 'function') {
      const stream = await model.stream(messages, { signal });
      const collected = await collectFromStream(stream, signal, (content) => {
        if (!onAnswerToken) {
          return;
        }
        anyDeltaEmitted = true;
        onAnswerToken(content);
      });
      if (collected) {
        return collected;
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw error;
    }
    if (anyDeltaEmitted) {
      throw error;
    }
  }

  const result = await model.invoke(messages, { signal });
  const aiMessage = toAIMessage(result);
  const text = contentToText(aiMessage.content);
  const pieces = chunkString(text, STREAM_FALLBACK_CHUNK_SIZE);
  if (onAnswerToken) {
    for (const piece of pieces) {
      if (signal?.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }
      onAnswerToken(piece);
    }
  }
  return { aiMessage, pieces };
}

async function collectFromStream(
  stream: AsyncIterable<unknown>,
  signal: AbortSignal | undefined,
  onAnswerToken: (content: string) => void,
): Promise<{ aiMessage: AIMessage; pieces: string[] } | null> {
  const pieces: string[] = [];
  let acc: AIMessageChunk | undefined;
  let sawChunk = false;

  for await (const raw of stream) {
    if (signal?.aborted) {
      throw new DOMException('Stream aborted', 'AbortError');
    }
    sawChunk = true;
    const chunk = toMessageChunk(raw);
    acc = acc ? acc.concat(chunk) : chunk;
    const text = extractStreamChunkContent(chunk.content);
    if (!text) {
      continue;
    }
    pieces.push(text);
    onAnswerToken(text);
  }

  if (!sawChunk || !acc) {
    return null;
  }
  return {
    aiMessage: toAIMessage(acc),
    pieces,
  };
}

function toMessageChunk(chunk: unknown): AIMessageChunk {
  if (chunk instanceof AIMessageChunk) {
    return chunk;
  }
  const record = chunk as {
    content?: unknown;
    tool_calls?: AIMessage['tool_calls'];
    tool_call_chunks?: AIMessageChunk['tool_call_chunks'];
  };
  const content =
    typeof record.content === 'string' || Array.isArray(record.content)
      ? record.content
      : extractStreamChunkContent(record.content);
  return new AIMessageChunk({
    content,
    tool_calls: record.tool_calls,
    tool_call_chunks: record.tool_call_chunks,
  });
}

function toAIMessage(result: unknown): AIMessage {
  if (result instanceof AIMessage) {
    return result;
  }
  if (result instanceof AIMessageChunk) {
    return new AIMessage({
      content: result.content,
      tool_calls: result.tool_calls,
    });
  }
  const record = result as {
    content?: unknown;
    tool_calls?: AIMessage['tool_calls'];
  };
  return new AIMessage({
    content: typeof record.content === 'string' ? record.content : '',
    tool_calls: record.tool_calls,
  });
}

function contentToText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}
