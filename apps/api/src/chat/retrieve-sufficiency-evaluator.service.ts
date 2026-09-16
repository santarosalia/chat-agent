import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { RetrieveSufficiencyEvaluatorPort } from './retrieve-evaluate-loop';
import {
  EVALUATOR_MAX_TOKENS,
  EVALUATOR_SYSTEM_PROMPT,
  INSUFFICIENT_FALLBACK,
  SufficiencyEvaluation,
  formatEvaluatorUserPrompt,
  parseSufficiencyEvaluation,
} from './retrieve-sufficiency';

@Injectable()
export class RetrieveSufficiencyEvaluator
  implements RetrieveSufficiencyEvaluatorPort
{
  private readonly logger = new Logger(RetrieveSufficiencyEvaluator.name);
  private readonly model: ChatOpenAI;

  constructor(private readonly config: ConfigService) {
    this.model = new ChatOpenAI({
      apiKey: this.config.get<string>('VLLM_API_KEY'),
      configuration: {
        baseURL: this.config.get<string>('VLLM_BASE_URL'),
      },
      model: this.config.get<string>('VLLM_MODEL') ?? 'gpt-4o-mini',
      temperature: 0,
      maxTokens: EVALUATOR_MAX_TOKENS,
    });
  }

  async evaluate(
    input: Parameters<RetrieveSufficiencyEvaluatorPort['evaluate']>[0],
  ): Promise<SufficiencyEvaluation> {
    try {
      const result = await this.model.invoke(
        [
          new SystemMessage(EVALUATOR_SYSTEM_PROMPT),
          new HumanMessage(formatEvaluatorUserPrompt(input)),
        ],
        { signal: input.signal },
      );
      const raw =
        typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      return parseSufficiencyEvaluation(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Retrieve sufficiency evaluate failed: ${message}`);
      return INSUFFICIENT_FALLBACK;
    }
  }
}
