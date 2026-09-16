import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatHistoryService } from '../chat-history/chat-history.service';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import { createChatGraph } from './chat.graph';
import { RetrieveSufficiencyEvaluator } from './retrieve-sufficiency-evaluator.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatMessageDto, ChatRole } from './dto/chat-message.dto';
import {
  formatSseEvent,
  isAbortError,
  SseMetaPayload,
} from './sse';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly model: ChatOpenAI;
  private readonly graph: ReturnType<typeof createChatGraph>;

  constructor(
    private readonly config: ConfigService,
    private readonly ragClient: RagRetrieveClient,
    private readonly chatHistory: ChatHistoryService,
    private readonly evaluator: RetrieveSufficiencyEvaluator,
  ) {
    this.model = new ChatOpenAI({
      apiKey: this.config.get<string>('VLLM_API_KEY'),
      configuration: {
        baseURL: this.config.get<string>('VLLM_BASE_URL'),
      },
      model: this.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
    });
    this.graph = createChatGraph({
      model: this.model,
      ragClient: this.ragClient,
      chatHistory: this.chatHistory,
      evaluator: this.evaluator,
    });
  }

  async chat(request: ChatRequestDto): Promise<ChatResponseDto> {
    const historyEnabled = await this.ensureHistoryAllowed(request);
    const result = await this.graph.invoke(
      toChatGraphInput(request, historyEnabled),
    );
    const response = this.buildResponse(
      result.retrieval,
      result.response ?? '',
    );
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
      const result = await this.graph.invoke(
        toChatGraphInput(request, historyEnabled),
        {
          signal,
          configurable: {
            onMeta: (retrieval: RagRetrieveResult) => {
              write(formatSseEvent('meta', this.buildMetaPayload(retrieval)));
            },
            onDelta: (content: string) => {
              write(formatSseEvent('delta', { content }));
            },
          },
        },
      );
      if (signal?.aborted) {
        return;
      }

      const fullContent = result.response ?? '';

      write(
        formatSseEvent('done', {
          message: { role: 'assistant', content: fullContent },
        }),
      );

      await this.persistTurnIfRequested(
        request,
        {
          message: { role: 'assistant', content: fullContent },
          rag_used: result.retrieval.ragUsed,
          citations: result.retrieval.ragUsed
            ? result.retrieval.citations
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

export function toChatGraphInput(
  request: ChatRequestDto,
  historyEnabled: boolean,
) {
  return {
    requestMessages: request.messages,
    sessionId: request.session_id,
    groupId: request.group_id,
    historyEnabled,
  };
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
