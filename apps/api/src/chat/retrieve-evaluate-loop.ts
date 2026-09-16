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

export type RetrieveSufficiencyEvaluatorPort = {
  evaluate(input: {
    question: string;
    citations: RagRetrieveResult['citations'];
    searchHistory: SearchHistoryEntry[];
    evaluationHistory: SufficiencyEvaluation[];
    signal?: AbortSignal;
  }): Promise<SufficiencyEvaluation>;
};

export async function runRetrieveRound(input: {
  ragClient: Pick<RagRetrieveClient, 'retrieve'>;
  question: string;
  groupId?: string;
  retrieval: RagRetrieveResult;
  searchHistory: SearchHistoryEntry[];
  evaluationHistory: SufficiencyEvaluation[];
}): Promise<{
  retrieval: RagRetrieveResult;
  searchHistory: SearchHistoryEntry[];
}> {
  const round = input.searchHistory.length;
  const topK = RETRIEVE_TOP_K_SCHEDULE[round];
  const query = nextRetrieveQuery(input.question, input.evaluationHistory.at(-1));
  logger.log(
    `retrieve round=${round + 1} query=${JSON.stringify(query)} group_id=${JSON.stringify(input.groupId ?? null)} top_k=${topK}`,
  );
  const incoming = await input.ragClient.retrieve(
    query,
    input.groupId,
    topK,
  );
  return {
    retrieval: mergeRetrievals(input.retrieval, incoming),
    searchHistory: [
      ...input.searchHistory,
      {
        query,
        topK,
        ragUsed: incoming.ragUsed,
        citationCount: incoming.citations.length,
      },
    ],
  };
}

export async function runEvaluateRound(input: {
  evaluator: RetrieveSufficiencyEvaluatorPort;
  question: string;
  retrieval: RagRetrieveResult;
  searchHistory: SearchHistoryEntry[];
  evaluationHistory: SufficiencyEvaluation[];
  signal?: AbortSignal;
}): Promise<{ evaluationHistory: SufficiencyEvaluation[] }> {
  const evaluation = await input.evaluator.evaluate({
    question: input.question,
    citations: input.retrieval.citations,
    searchHistory: [...input.searchHistory],
    evaluationHistory: [...input.evaluationHistory],
    signal: input.signal,
  });
  logger.log(
    `evaluate round=${input.searchHistory.length} ${JSON.stringify(evaluation)}`,
  );
  return {
    evaluationHistory: [...input.evaluationHistory, evaluation],
  };
}

export function routeAfterEvaluate(input: {
  evaluationHistory: SufficiencyEvaluation[];
  searchHistory: SearchHistoryEntry[];
}): 'retrieve' | 'answer' {
  const last = input.evaluationHistory.at(-1);
  if (last?.sufficient) {
    return 'answer';
  }
  if (input.searchHistory.length >= MAX_RETRIEVE_ROUNDS) {
    return 'answer';
  }
  return 'retrieve';
}
