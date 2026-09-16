import { formatContextBlock } from '../rag/rag-retrieve.client';
import { RagCitation, RagRetrieveResult } from '../rag/rag.types';

export const RETRIEVE_TOP_K_SCHEDULE = [5, 10, 20] as const;
export const MAX_RETRIEVE_ROUNDS = RETRIEVE_TOP_K_SCHEDULE.length;
export const EVALUATOR_MAX_TOKENS = 200;

export type SufficiencyEvaluation = {
  sufficient: boolean;
  missing: string[];
  confidence: number;
};

export type SearchHistoryEntry = {
  query: string;
  topK: number;
  ragUsed: boolean;
  citationCount: number;
};

export const INSUFFICIENT_FALLBACK: SufficiencyEvaluation = {
  sufficient: false,
  missing: [],
  confidence: 0,
};

export const EVALUATOR_SYSTEM_PROMPT = [
  '너는 retrieve 결과 충분성 평가기다. 사용자에게 답하지 마라. JSON 객체 하나만 출력한다.',
  '형식: {"sufficient":false,"missing":["B의 적용 조건","B의 예외 사항"],"confidence":0.72}',
  'sufficient: 현재 검색 결과만으로 질문에 답할 수 있으면 true.',
  'missing: 아직 없는 정보. 다음 검색에 쓸 짧은 구. 충분하면 [].',
  'confidence: 0과 1 사이.',
  '설명, 마크다운, 다른 텍스트 금지.',
].join('\n');

export function parseSufficiencyEvaluation(
  raw: string,
): SufficiencyEvaluation {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed.sufficient !== 'boolean') {
    return INSUFFICIENT_FALLBACK;
  }
  const missing = Array.isArray(parsed.missing)
    ? parsed.missing
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];
  const confidence =
    typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;
  return {
    sufficient: parsed.sufficient,
    missing,
    confidence,
  };
}

export function nextRetrieveQuery(
  userQuery: string,
  lastEvaluation?: SufficiencyEvaluation,
): string {
  const missing = lastEvaluation?.missing ?? [];
  if (missing.length === 0) {
    return userQuery;
  }
  return missing.join(' ');
}

export function mergeRetrievals(
  current: RagRetrieveResult,
  incoming: RagRetrieveResult,
): RagRetrieveResult {
  const citations: RagCitation[] = [];
  const seen = new Set<string>();
  for (const citation of [...current.citations, ...incoming.citations]) {
    const key = `${citation.filename}:${citation.page}:${citation.snippet}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    citations.push(citation);
  }
  if (citations.length === 0) {
    return {
      ragUsed: false,
      citations: [],
      contextBlock: null,
    };
  }
  return {
    ragUsed: true,
    citations,
    contextBlock: formatContextBlock(citations),
  };
}

export function formatEvaluatorUserPrompt(input: {
  question: string;
  citations: RagCitation[];
  searchHistory: SearchHistoryEntry[];
  evaluationHistory: SufficiencyEvaluation[];
}): string {
  const retrieved =
    input.citations.length === 0
      ? '(없음)'
      : input.citations
          .map(
            (citation) =>
              `- (${citation.filename} p.${citation.page}) ${citation.snippet}`,
          )
          .join('\n');
  return [
    `question: ${input.question}`,
    `search_history: ${JSON.stringify(input.searchHistory)}`,
    `evaluation_history: ${JSON.stringify(input.evaluationHistory)}`,
    'retrieved:',
    retrieved,
  ].join('\n');
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
