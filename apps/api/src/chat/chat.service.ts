import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { injectRetrievedContext } from '../rag/rag-context.injector';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import { truncateMessagesForLlm } from './context-truncate';
import { createChatGraph, toLangChainMessages } from './chat.graph';
import {
  ChatRequestDto,
  DEFAULT_RAG_TOP_K,
} from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatMessageDto } from './dto/chat-message.dto';
import {
  chunkString,
  extractStreamChunkContent,
  formatSseEvent,
  isAbortError,
  SseMetaPayload,
} from './sse';

const STREAM_FALLBACK_CHUNK_SIZE = 32;

export interface PreparedChatInput {
  retrieval: RagRetrieveResult;
  truncatedMessages: ChatMessageDto[];
}

@Injectable()
export class ChatService {
  private readonly model: ChatOpenAI;
  private readonly graph: ReturnType<typeof createChatGraph>;

  constructor(
    private readonly config: ConfigService,
    private readonly ragClient: RagRetrieveClient,
  ) {
    this.model = new ChatOpenAI({
      apiKey: this.config.get<string>('VLLM_API_KEY'),
      configuration: {
        baseURL: this.config.get<string>('VLLM_BASE_URL'),
      },
      model: this.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
    });
    this.graph = createChatGraph(this.model);
  }

  async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    const prepared = await this.prepareChatInput(request);
    const result = await this.graph.invoke({
      messages: toLangChainMessages(prepared.truncatedMessages),
    });
    return this.buildResponse(prepared.retrieval, result.response ?? '');
  }

  async streamChat(
    request: ChatRequestDto,
    write: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      const prepared = await this.prepareChatInput(request);
      if (signal?.aborted) {
        return;
      }

      write(formatSseEvent('meta', this.buildMetaPayload(prepared.retrieval)));

      const langChainMessages = toLangChainMessages(prepared.truncatedMessages);
      const fullContent = await this.streamLlmContent(
        langChainMessages,
        write,
        signal,
      );

      if (signal?.aborted) {
        return;
      }

      write(
        formatSseEvent('done', {
          message: { role: 'assistant', content: fullContent },
        }),
      );
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      write(formatSseEvent('error', { message }));
    }
  }

  private async prepareChatInput(
    request: ChatRequestDto,
  ): Promise<PreparedChatInput> {
    const retrieveQuery = getLastUserMessageContent(request.messages);
    const retrieval = await this.ragClient.retrieve(
      retrieveQuery,
      request.group_id,
      request.top_k ?? DEFAULT_RAG_TOP_K,
    );

    const messagesForLlm = retrieval.ragUsed
      ? injectRetrievedContext(request.messages, retrieval.contextBlock!)
      : request.messages;

    const truncatedMessages = truncateMessagesForLlm(messagesForLlm);

    return { retrieval, truncatedMessages };
  }

  private buildResponse(
    retrieval: RagRetrieveResult,
    content: string,
  ): ChatResponseDto {
    const response: ChatResponseDto = {
      message: {
        role: 'assistant',
        content,
      },
      rag_used: retrieval.ragUsed,
    };

    if (retrieval.ragUsed) {
      response.citations = retrieval.citations;
    }

    return response;
  }

  private buildMetaPayload(retrieval: RagRetrieveResult): SseMetaPayload {
    const payload: SseMetaPayload = { rag_used: retrieval.ragUsed };
    if (retrieval.ragUsed) {
      payload.citations = retrieval.citations;
    }
    return payload;
  }

  private async streamLlmContent(
    langChainMessages: ReturnType<typeof toLangChainMessages>,
    write: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      const stream = await this.model.stream(langChainMessages, { signal });
      let fullContent = '';
      for await (const chunk of stream) {
        if (signal?.aborted) {
          throw new DOMException('Stream aborted', 'AbortError');
        }
        const content = extractStreamChunkContent(chunk.content);
        if (content) {
          fullContent += content;
          write(formatSseEvent('delta', { content }));
        }
      }
      if (fullContent.length > 0) {
        return fullContent;
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      // LangGraph single-node path does not expose token streaming; fall back below.
    }

    const result = await this.graph.invoke(
      { messages: langChainMessages },
      { signal },
    );
    const fullContent = result.response ?? '';
    for (const content of chunkString(fullContent, STREAM_FALLBACK_CHUNK_SIZE)) {
      if (signal?.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }
      write(formatSseEvent('delta', { content }));
    }
    return fullContent;
  }
}

export function getLastUserMessageContent(
  messages: Array<{ role: string; content: string }>,
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return messages[messages.length - 1]?.content ?? '';
}
