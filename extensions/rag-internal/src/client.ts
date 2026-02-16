import type { SsrFPolicy } from "../../../src/infra/net/ssrf.js";
import type { RagSearchRequest, RagSearchResponse } from "./types.js";
import { fetchWithSsrFGuard } from "../../../src/infra/net/fetch-guard.js";
import { createSubsystemLogger } from "../../../src/logging/subsystem.js";

const logger = createSubsystemLogger("rag-internal:client");

// SSRF policy: only the RAG endpoint host is allowed
const RAG_SSRF_POLICY: SsrFPolicy = {
  allowPrivateNetwork: false,
  hostnameAllowlist: [process.env.RAG_ENDPOINT_HOST!],
};

const RAG_TIMEOUT_MS = 10_000;
const MAX_RETRIES_ON_429 = 3;

export class RagClientError extends Error {
  constructor(
    public status: number,
    public userMessage: string,
    detail?: string,
  ) {
    super(`RAG request failed: ${status}${detail ? ` — ${detail}` : ""}`);
    this.name = "RagClientError";
  }
}

/** @deprecated Use RagClientError */
export const RagHttpError = RagClientError;

export async function searchRag(
  request: RagSearchRequest,
  delegatedToken: string,
): Promise<RagSearchResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }

    const { response, release } = await fetchWithSsrFGuard({
      url: process.env.RAG_ENDPOINT_URL!,
      policy: RAG_SSRF_POLICY,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${delegatedToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
      timeoutMs: RAG_TIMEOUT_MS,
      auditContext: "rag-internal:search",
    });

    try {
      // Rate limited — retry
      if (response.status === 429) {
        logger.warn("RAG rate limited", { attempt });
        lastError = new RagClientError(429, "Document search is busy. Retrying...");
        continue;
      }

      // Auth failure — do NOT retry (caller should clear token cache and retry)
      if (response.status === 401) {
        throw new RagClientError(
          401,
          "Your session expired. Please send your question again.",
          "Delegated token rejected by RAG",
        );
      }

      // Forbidden — do NOT retry
      if (response.status === 403) {
        throw new RagClientError(
          403,
          "Identity verification error. Please try again.",
          "RAG returned 403",
        );
      }

      // Client error — our bug, do NOT retry
      if (response.status === 400) {
        const body = await response.text();
        logger.error("RAG bad request (OpenClaw bug)", { body });
        throw new RagClientError(400, "Something went wrong. Please try again.", body);
      }

      // Timeout
      if (response.status === 408 || response.status === 504) {
        throw new RagClientError(
          response.status,
          "Document search is taking longer than expected. Please try again.",
        );
      }

      // Server error
      if (response.status >= 500) {
        throw new RagClientError(
          response.status,
          "I'm having trouble searching documents. Please try again.",
        );
      }

      // Success
      if (!response.ok) {
        throw new RagClientError(response.status, "Unexpected error searching documents.");
      }

      return (await response.json()) as RagSearchResponse;
    } finally {
      await release();
    }
  }

  // All retries exhausted (429)
  throw lastError ?? new RagClientError(429, "Document search is busy. Please try again later.");
}
