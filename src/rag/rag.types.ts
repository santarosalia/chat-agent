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

export interface RagRetrieveHit {
  filename?: string;
  page?: number;
  snippet?: string;
}

export interface RagRetrieveResponse {
  results?: RagRetrieveHit[];
  hits?: RagRetrieveHit[];
  items?: RagRetrieveHit[];
}
