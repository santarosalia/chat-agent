import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { injectRetrievedContext } from '../rag/rag-context.injector';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { createChatGraph, toLangChainMessages } from './chat.graph';
import {
  ChatRequestDto,
  DEFAULT_RAG_TOP_K,
} from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

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
    const retrieveQuery = getLastUserMessageContent(request.messages);
    const retrieval = await this.ragClient.retrieve(
      retrieveQuery,
      request.group_id,
      request.top_k ?? DEFAULT_RAG_TOP_K,
    );

    const messagesForLlm = retrieval.ragUsed
      ? injectRetrievedContext(request.messages, retrieval.contextBlock!)
      : request.messages;

    const result = await this.graph.invoke({
      messages: toLangChainMessages(messagesForLlm),
    });

    const response: ChatResponseDto = {
      message: {
        role: 'assistant',
        content: result.response ?? '',
      },
      rag_used: retrieval.ragUsed,
    };

    if (retrieval.ragUsed) {
      response.citations = retrieval.citations;
    }

    return response;
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
