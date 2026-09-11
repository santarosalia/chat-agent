import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatHistoryService } from '../chat-history/chat-history.service';
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
import { ChatMessageDto, ChatRole } from './dto/chat-message.dto';
import { formatLlmRequestLog } from './llm-request-log';
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
  private readonly logger = new Logger(ChatService.name);
  private readonly model: ChatOpenAI;
  private readonly graph: ReturnType<typeof createChatGraph>;

  constructor(
    private readonly config: ConfigService,
    private readonly ragClient: RagRetrieveClient,
    private readonly chatHistory: ChatHistoryService,
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
    const historyEnabled = await this.ensureHistoryAllowed(request);
    const prepared = await this.prepareChatInput(request, historyEnabled);
    const result = await this.graph.invoke({
      messages: toLangChainMessages(prepared.truncatedMessages),
    });
    const response = this.buildResponse(prepared.retrieval, result.response ?? '');
    await this.persistTurnIfRequested(request, response, historyEnabled);
    return response;
  }

  async streamChat(
    request: ChatRequestDto,
    write: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    let historyEnabled = false;
    try {
      historyEnabled = await this.ensureHistoryAllowed(request);
      const prepared = await this.prepareChatInput(request, historyEnabled);
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

      await this.persistTurnIfRequested(
        request,
        {
          message: { role: 'assistant', content: fullContent },
          rag_used: prepared.retrieval.ragUsed,
          citations: prepared.retrieval.ragUsed
            ? prepared.retrieval.citations
            : undefined,
        },
        historyEnabled,
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
    historyEnabled: boolean,
  ): Promise<PreparedChatInput> {
    const retrieveQuery = getLastUserMessageContent(request.messages);
    const conversation = await this.resolveConversation(
      request,
      historyEnabled,
    );
    const retrieval = await this.ragClient.retrieve(
      retrieveQuery,
      request.group_id,
      request.top_k ?? DEFAULT_RAG_TOP_K,
    );

    const messagesForLlm = retrieval.ragUsed
      ? injectRetrievedContext(conversation, retrieval.contextBlock!)
      : conversation;

    const truncatedMessages = truncateMessagesForLlm(messagesForLlm);

    this.logger.log(
      formatLlmRequestLog({
        model: this.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
        baseUrl: this.config.get<string>('VLLM_BASE_URL'),
        messages: truncatedMessages,
      }),
    );

    return { retrieval, truncatedMessages };
  }

  private async resolveConversation(
    request: ChatRequestDto,
    historyEnabled: boolean,
  ): Promise<ChatMessageDto[]> {
    if (!historyEnabled || !request.session_id) {
      return request.messages;
    }

    try {
      const stored = await this.chatHistory.listActiveMessages(
        request.session_id,
      );
      const incoming = getLastUserMessage(request.messages);
      return incoming ? [...stored, incoming] : [...stored, ...request.messages];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Chat history load failed; using request messages only: ${message}`,
      );
      return request.messages;
    }
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
    let anyDeltaEmitted = false;

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
          anyDeltaEmitted = true;
        }
      }
      if (fullContent.length > 0) {
        return fullContent;
      }
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        throw error;
      }
      if (anyDeltaEmitted) {
        throw error;
      }
      // Zero deltas emitted: LangGraph invoke fallback is allowed.
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

  async ensureHistoryAllowed(request: ChatRequestDto): Promise<boolean> {
    if (!request.session_id) {
      return false;
    }
    try {
      await this.chatHistory.assertCanAppend(
        request.session_id,
        request.user_id,
      );
      return true;
    } catch (error) {
      if (
        error instanceof GoneException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Chat history pre-check failed; skipping persistence: ${message}`,
      );
      return false;
    }
  }

  private async persistTurnIfRequested(
    request: ChatRequestDto,
    response: ChatResponseDto,
    historyEnabled: boolean,
  ): Promise<void> {
    if (!historyEnabled || !request.session_id) {
      return;
    }
    const userContent = getLastUserMessageContentForHistory(request.messages);
    if (!userContent) {
      return;
    }
    try {
      await this.chatHistory.appendTurn({
        sessionId: request.session_id,
        userId: request.user_id,
        userContent,
        assistantContent: response.message.content,
        ragUsed: response.rag_used,
        citations: response.citations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Chat history append failed; chat response unchanged: ${message}`,
      );
    }
  }
}

export function getLastUserMessage(
  messages: ChatMessageDto[],
): ChatMessageDto | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return messages[i];
    }
  }
  return undefined;
}

export function getLastUserMessageContentForHistory(
  messages: ChatMessageDto[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === ChatRole.User) {
      return messages[i].content;
    }
  }
  return undefined;
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
