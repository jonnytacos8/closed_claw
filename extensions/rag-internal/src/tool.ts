import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { RagChunk, RagSearchRequest } from "./types.js";
import { createSubsystemLogger } from "../../../src/logging/subsystem.js";
import { clearTokenCache, getDelegatedToken, readCachedTokenAgeSeconds } from "./auth.js";
import { RagHttpError, searchRag } from "./client.js";

const logger = createSubsystemLogger("rag-internal");

const RAG_SEARCH_TOOL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    query: { type: "string", description: "Natural-language document query" },
    user_upn: { type: "string", description: "Requesting user UPN" },
    user_id: { type: "string", description: "Requesting user AAD object ID" },
    user_sso_token: { type: "string", description: "Teams SSO token for OBO exchange" },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        libraries: { type: "array", items: { type: "string" } },
        file_types: { type: "array", items: { type: "string" } },
        modified_after: { type: "string" },
      },
    },
    max_results: { type: "number" },
    include_citations: { type: "boolean" },
    min_score: { type: "number" },
  },
  required: ["query", "user_upn", "user_id", "user_sso_token"],
} as const;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function citationContext(chunk: RagChunk): string {
  const parts: string[] = [];
  if (chunk.metadata.sheet_name) {
    parts.push(`Sheet: ${chunk.metadata.sheet_name}`);
  }
  if (chunk.metadata.cell_range) {
    parts.push(chunk.metadata.cell_range);
  }
  if (typeof chunk.metadata.page_number === "number") {
    parts.push(`Page ${chunk.metadata.page_number}`);
  }
  return parts.length > 0 ? ` — ${parts.join(" ")}` : "";
}

function formatChunk(chunk: RagChunk, index: number): string {
  return `[${index + 1}] ${chunk.document_title}${citationContext(chunk)}:\n${chunk.chunk_text}`;
}

function selectBudgetedChunks(results: RagChunk[]): RagChunk[] {
  const sorted = [...results].sort((a, b) => b.relevance_score - a.relevance_score);
  const selected: RagChunk[] = [];
  const perDoc = new Map<string, number>();
  let totalChars = 0;

  for (const chunk of sorted) {
    if (chunk.relevance_score < 0.3) {
      continue;
    }
    const docCount = perDoc.get(chunk.document_id) ?? 0;
    if (docCount >= 4) {
      continue;
    }
    const nextChars = totalChars + chunk.chunk_text.length;
    if (selected.length >= 8 || nextChars > 16_000) {
      break;
    }
    selected.push(chunk);
    perDoc.set(chunk.document_id, docCount + 1);
    totalChars = nextChars;
  }

  return selected;
}

export function createRagSearchTool(): AnyAgentTool {
  return {
    name: "rag_search",
    label: "Internal RAG Search",
    description: "Search security-trimmed SharePoint content through internal RAG.",
    parameters: RAG_SEARCH_TOOL_SCHEMA,
    async execute(_toolCallId, params) {
      const input = (params ?? {}) as Record<string, unknown>;
      const query = asString(input.query);
      const userUpn = asString(input.user_upn);
      const userId = asString(input.user_id);
      const ssoToken = asString(input.user_sso_token);

      if (!query || !userUpn || !userId || !ssoToken) {
        throw new Error("query, user_upn, user_id, and user_sso_token are required");
      }

      const request: RagSearchRequest = {
        query,
        filters: (input.filters as RagSearchRequest["filters"]) ?? undefined,
        max_results: typeof input.max_results === "number" ? Math.min(25, input.max_results) : 10,
        include_citations:
          typeof input.include_citations === "boolean" ? input.include_citations : true,
        min_score: typeof input.min_score === "number" ? input.min_score : 0.3,
        user_context: { upn: userUpn },
      };

      const delegatedToken = await getDelegatedToken(ssoToken, userId);

      let response;
      try {
        response = await searchRag(request, delegatedToken);
      } catch (error) {
        if (error instanceof RagHttpError && error.status === 401) {
          clearTokenCache(userId);
          const freshToken = await getDelegatedToken(ssoToken, userId);
          response = await searchRag(request, freshToken);
        } else {
          throw error;
        }
      }

      const selected = selectBudgetedChunks(response.results);
      const formatted = selected.map((chunk, i) => formatChunk(chunk, i)).join("\n\n");

      logger.info("rag_search", {
        rag_query_id: response.query_id,
        chunk_count: selected.length,
        auth_method: "obo_delegated",
        token_age_seconds: readCachedTokenAgeSeconds(userId),
      });

      return {
        content: [
          {
            type: "text",
            text: formatted || "No relevant chunks found.",
          },
        ],
        details: {
          query_id: response.query_id,
          total_matches: response.total_matches,
          truncated: response.truncated,
          chunks: selected.map((chunk, index) => ({
            marker: index + 1,
            chunk_id: chunk.chunk_id,
            document_id: chunk.document_id,
            document_title: chunk.document_title,
            document_url: chunk.document_url,
            relevance_score: chunk.relevance_score,
            metadata: chunk.metadata,
          })),
        },
      };
    },
  };
}
