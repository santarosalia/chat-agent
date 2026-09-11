import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ChatMessageDto } from './dto/chat-message.dto';
import {
  formatRewriteUserPrompt,
  lastUserContentForRewrite,
  parseRewrittenQuery,
  shouldRewriteRetrieveQuery,
} from './retrieve-query-rewrite';

const REWRITE_SYSTEM_PROMPT =
  '너는 대화형 RAG의 검색 쿼리 작성기다. 사용자에게 답하지 말고, dense/sparse 검색에 쓸 독립 질문 한 줄만 출력한다.';

@Injectable()
export class RetrieveQueryRewriter {
  private readonly logger = new Logger(RetrieveQueryRewriter.name);
  private readonly model: ChatOpenAI;

  constructor(private readonly config: ConfigService) {
    this.model = new ChatOpenAI({
      apiKey: this.config.get<string>('VLLM_API_KEY'),
      configuration: {
        baseURL: this.config.get<string>('VLLM_BASE_URL'),
      },
      model: this.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 128,
    });
  }

  async rewrite(conversation: ChatMessageDto[]): Promise<string> {
    const fallback = lastUserContentForRewrite(conversation);
    if (!shouldRewriteRetrieveQuery(conversation)) {
      return fallback;
    }

    try {
      const result = await this.model.invoke([
        new SystemMessage(REWRITE_SYSTEM_PROMPT),
        new HumanMessage(formatRewriteUserPrompt(conversation)),
      ]);
      const raw =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      const rewritten = parseRewrittenQuery(raw, fallback);
      this.logger.log(
        `Retrieve query rewrite original=${JSON.stringify(fallback)} rewritten=${JSON.stringify(rewritten)}`,
      );
      return rewritten;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Retrieve query rewrite failed; using last user message: ${message}`,
      );
      return fallback;
    }
  }
}
