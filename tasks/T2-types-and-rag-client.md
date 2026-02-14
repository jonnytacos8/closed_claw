# T2 — RAG Types and HTTP Client

## Goal

Create the TypeScript types for the internal RAG API contract and the HTTP client that calls it. After this task, `searchRag(request, token)` is a callable function that sends a properly-formed request to the RAG endpoint through OpenClaw's SSRF guard.

## Prerequisites

- **T1** completed (extension scaffold exists at `extensions/rag-internal/`).

## Files to Create

### 1. `extensions/rag-internal/src/types.ts`

These types match the RAG service contract defined in `docs/06-rag-contract.md`.

```typescript
// === RAG Request ===
export type RagSearchRequest = {
  query: string;
  filters?: {
    libraries?: string[];
    file_types?: string[];
    modified_after?: string; // ISO 8601
  };
  max_results?: number;       // default 10, max 25
  min_score?: number;         // default 0.3
  include_citations?: boolean; // default true
  user_context: {
    upn: string;               // must match delegated token's upn claim
  };
};

// === RAG Response ===
export type RagSearchResponse = {
  results: RagChunk[];
  total_matches: number;
  query_id: string;           // correlation ID for RAG-side audit
  truncated: boolean;
};

export type RagChunk = {
  chunk_id: string;
  document_id: string;        // SharePoint item ID
  document_title: string;
  document_url: string;       // SharePoint webUrl — REQUIRED for citations
  library: string;
  chunk_text: string;         // max ~2000 chars
  chunk_index: number;
  total_chunks: number;
  relevance_score: number;    // 0.0–1.0
  metadata: RagChunkMetadata;
};

export type RagChunkMetadata = {
  file_type: string;          // .xlsx, .csv, .docx, .pdf, .pptx
  sheet_name?: string | null;
  cell_range?: string | null;
  page_number?: number | null;
  section_heading?: string | null;
  last_modified: string;      // ISO 8601
  last_modified_by?: string;
  dlp_labels?: string[];
  content_type?: "table" | "text" | "formula" | "mixed";
};
```

### 2. `extensions/rag-internal/src/client.ts`

This module calls the internal RAG service via `fetchWithSsrFGuard()` from OpenClaw's network infrastructure. The SSRF guard ensures only allowlisted hostnames can be reached.

```typescript
import { fetchWithSsrFGuard } from "../../../../src/infra/net/fetch-guard.js";
import type { SsrFPolicy } from "../../../../src/infra/net/ssrf.js";
import { createSubsystemLogger } from "openclaw/plugin-sdk";
import type { RagSearchRequest, RagSearchResponse } from "./types.js";

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

export async function searchRag(
  request: RagSearchRequest,
  delegatedToken: string,
): Promise<RagSearchResponse> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES_ON_429; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
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
        throw new RagClientError(
          400,
          "Something went wrong. Please try again.",
          body,
        );
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
        throw new RagClientError(
          response.status,
          "Unexpected error searching documents.",
        );
      }

      return (await response.json()) as RagSearchResponse;
    } finally {
      await release();
    }
  }

  // All retries exhausted (429)
  throw lastError ?? new RagClientError(429, "Document search is busy. Please try again later.");
}
```

**Key implementation details:**

- **SSRF guard:** `fetchWithSsrFGuard()` is imported from `src/infra/net/fetch-guard.ts`. It enforces that outbound requests only go to `hostnameAllowlist` hosts. The `SsrFPolicy` type is from `src/infra/net/ssrf.ts`.
- **`release()` must be called:** The SSRF guard returns a `release` function — always call it in a `finally` block.
- **Env vars:** `RAG_ENDPOINT_URL` is the full URL (e.g., `https://rag-host/api/v1/search`). `RAG_ENDPOINT_HOST` is just the hostname for the SSRF allowlist (e.g., `rag-host`).
- **Error contract:** Matches `docs/06-rag-contract.md` error table. Each HTTP status maps to a specific user-facing message and code behavior.
- **Retry:** Only 429 gets retried (exponential backoff, max 3). Auth errors (401/403) are thrown immediately — the caller (tool handler in T4) handles token refresh.

### Import Path Note

The import paths use relative paths (`../../../../src/infra/net/...`) because the extension lives in `extensions/rag-internal/` while the SSRF infrastructure is in `src/infra/net/`. This follows how other extensions reference core modules. Check if `openclaw/plugin-sdk` re-exports `fetchWithSsrFGuard` — if so, use:

```typescript
import { fetchWithSsrFGuard } from "openclaw/plugin-sdk";
```

The plugin SDK at `src/plugin-sdk/index.ts` exports `fetchWithSsrFGuard`, so **prefer the plugin-sdk import**.

## Verification

1. Types compile without errors.
2. `searchRag()` function signature matches: `(request: RagSearchRequest, delegatedToken: string) => Promise<RagSearchResponse>`.
3. The SSRF policy only allows `RAG_ENDPOINT_HOST`.
4. 401/403 errors throw immediately (no retry).
5. 429 retries up to 3 times with exponential backoff.
6. `release()` is always called in `finally`.

## What This Does NOT Include

- No auth/OBO token acquisition (T3)
- No tool registration or chunk formatting (T4)
- No system prompt (T4)

## Estimated Scope

2 files, ~150 lines of code total.
