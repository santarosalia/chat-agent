import { Logger } from '@nestjs/common';
import { RagRetrieveClient } from '../rag/rag-retrieve.client';
import { RagRetrieveResult } from '../rag/rag.types';
import {
  MAX_RETRIEVE_ROUNDS,
  RETRIEVE_TOP_K_SCHEDULE,
  SearchHistoryEntry,
  SufficiencyEvaluation,
  mergeRetrievals,
  nextRetrieveQuery,
} from './retrieve-sufficiency';

const logger = new Logger('RetrieveEvaluateLoop');

const emptyRetrieval = (): RagRetrieveResult => ({
  ragUsed: false,
  citations: [],
  contextBlock: null,
});

export type RetrieveSufficiencyEvaluatorPort = {
  evaluate(input: {
    question: string;
    citations: RagRetrieveResult['citations'];
    searchHistory: SearchHistoryEntry[];
    evaluationHistory: SufficiencyEvaluation[];
    signal?: AbortSignal;
  }): Promise<SufficiencyEvaluation>;
};

export async function runRetrieveEvaluateLoop(input: {
  ragClient: Pick<RagRetrieveClient, 'retrieve'>;
  evaluator: RetrieveSufficiencyEvaluatorPort;
  question: string;
  groupId?: string;
  signal?: AbortSignal;
}): Promise<{
  retrieval: RagRetrieveResult;
  searchHistory: SearchHistoryEntry[];
  evaluationHistory: SufficiencyEvaluation[];
}> {
  const question = input.question.trim();
  const searchHistory: SearchHistoryEntry[] = [];
  const evaluationHistory: SufficiencyEvaluation[] = [];
  let retrieval = emptyRetrieval();
  if (!question) {
    return { retrieval, searchHistory, evaluationHistory };
  }

  for (let round = 0; round < MAX_RETRIEVE_ROUNDS; round += 1) {
    const topK = RETRIEVE_TOP_K_SCHEDULE[round];
    const query = nextRetrieveQuery(question, evaluationHistory.at(-1));
    logger.log(
      `retrieve round=${round + 1} query=${JSON.stringify(query)} group_id=${JSON.stringify(input.groupId ?? null)} top_k=${topK}`,
    );
    const incoming = await input.ragClient.retrieve(
      query,
      input.groupId,
      topK,
    );
    retrieval = mergeRetrievals(retrieval, incoming);
    searchHistory.push({
      query,
      topK,
      ragUsed: incoming.ragUsed,
      citationCount: incoming.citations.length,
    });
    const evaluation = await input.evaluator.evaluate({
      question,
      citations: retrieval.citations,
      searchHistory: [...searchHistory],
      evaluationHistory: [...evaluationHistory],
      signal: input.signal,
    });
    evaluationHistory.push(evaluation);
    logger.log(`evaluate round=${round + 1} ${JSON.stringify(evaluation)}`);
    if (evaluation.sufficient) {
      break;
    }
  }

  return { retrieval, searchHistory, evaluationHistory };
}
