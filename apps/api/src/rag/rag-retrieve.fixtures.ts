import { RagRetrieveCitation, RagRetrieveResponse } from './rag.types';

/** Matches santarosalia/rag RetrieveResponse.citations item shape. */
export const sampleRagApiCitation: RagRetrieveCitation = {
  chunk_id: 'chunk-1',
  doc_id: 'doc-1',
  filename: 'guide.pdf',
  page: 2,
  score: 0.91,
  snippet: 'NestJS basics',
  rank: 1,
};

export function buildRagRetrieveResponse(
  citations: RagRetrieveCitation[],
  overrides: Partial<RagRetrieveResponse> = {},
): RagRetrieveResponse {
  return {
    query: 'sample query',
    mode: 'hybrid',
    backend: 'pgvector',
    citations,
    latency_ms: { total: 42.5 },
    ...overrides,
  };
}

/** Legacy/wrong shape that must NOT enable RAG (regression guard). */
export function buildLegacyResultsResponse(
  results: Array<{ filename: string; page: number; snippet: string }>,
) {
  return { results };
}
