export interface RagCitation {
  filename: string;
  page: number;
  snippet: string;
}

export interface RagRetrieveResult {
  ragUsed: boolean;
  citations: RagCitation[];
  contextBlock: string | null;
}

/** Citation item from santarosalia/rag POST /v1/retrieve (RetrieveResponse.citations). */
export interface RagRetrieveCitation {
  chunk_id?: string;
  doc_id?: string;
  filename?: string;
  page?: number | null;
  score?: number;
  snippet?: string | null;
  rank?: number;
  content?: string | null;
}

export interface RagRetrieveResponse {
  query?: string;
  mode?: string;
  backend?: string;
  citations?: RagRetrieveCitation[];
  latency_ms?: Record<string, number>;
}
