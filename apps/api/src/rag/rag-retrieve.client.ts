import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  RagCitation,
  RagRetrieveResponse,
  RagRetrieveResult,
} from "./rag.types";

const RETRIEVE_TIMEOUT_MS = 5000;

@Injectable()
export class RagRetrieveClient {
  private readonly logger = new Logger(RagRetrieveClient.name);

  constructor(private readonly config: ConfigService) {}

  async retrieve(
    query: string,
    groupId?: string,
    topK = 5
  ): Promise<RagRetrieveResult> {
    const ragBase = this.config.get<string>("RAG_BASE");
    if (!ragBase) {
      this.logger.warn("RAG_BASE is not configured; skipping retrieval");
      return emptyResult();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RETRIEVE_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${ragBase.replace(/\/$/, "")}/v1/retrieve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRetrieveBody(query, groupId, topK)),
          signal: controller.signal,
        }
      );

      if (response.status >= 500) {
        this.logger.warn(`RAG retrieve returned ${response.status}; skipping`);
        return emptyResult();
      }

      if (!response.ok) {
        this.logger.warn(`RAG retrieve returned ${response.status}; skipping`);
        return emptyResult();
      }

      const body = (await response.json()) as RagRetrieveResponse;
      const citations = (body.citations ?? [])
        .map((item) => toCitation(item))
        .filter((c): c is RagCitation => c !== null);

      if (citations.length === 0) {
        return emptyResult();
      }

      return {
        ragUsed: true,
        citations,
        contextBlock: formatContextBlock(citations),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RAG retrieve failed: ${message}; skipping`);
      return emptyResult();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildRetrieveBody(
  query: string,
  groupId: string | undefined,
  topK: number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query,
    mode: "hybrid",
    top_k: topK,
    rerank: true,
    snippet: false,
    content: true,
  };
  if (groupId) {
    body.group_id = groupId;
  }
  return body;
}

function emptyResult(): RagRetrieveResult {
  return { ragUsed: false, citations: [], contextBlock: null };
}

function toCitation(hit: {
  filename?: string;
  page?: number | null;
  snippet?: string | null;
  content?: string | null;
}): RagCitation | null {
  const filename = hit.filename?.trim();
  const snippet = hit.content?.trim() || hit.snippet?.trim();
  if (!filename || !snippet) {
    return null;
  }
  const page = typeof hit.page === "number" && hit.page > 0 ? hit.page : 1;
  return { filename, page, snippet };
}

export function formatContextBlock(citations: RagCitation[]): string {
  const lines = citations.map(
    (c) => `- (${c.filename} p.${c.page}) ${c.snippet}`
  );
  return `[Retrieved context]\n${lines.join("\n")}`;
}
