# 03 — Internal Service Interfaces

This document defines the service interfaces and provides the TypeScript types a coding agent must create in `extensions/rag-internal/src/types.ts`.

---

## A) RAG Query Endpoint

### Contract

| Field | Value |
|-------|-------|
| **URL** | `${RAG_ENDPOINT_URL}` (env var, e.g., `https://<rag-host>/api/v1/search`) |
| **Method** | `POST` |
| **Auth** | `Authorization: Bearer <delegated_user_token>` (OBO token — see doc 04) |
| **Content-Type** | `application/json` |
| **Timeout** | 10s (configurable in client.ts) |

### TypeScript Types to Create (`extensions/rag-internal/src/types.ts`)

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

### Example Request

```json
{
  "query": "What drove the variance in Q3 COGS vs budget?",
  "filters": {
    "libraries": ["finance-models", "budget-2025"],
    "file_types": [".xlsx", ".csv", ".docx", ".pdf"]
  },
  "max_results": 10,
  "include_citations": true,
  "user_context": { "upn": "jane.doe@contoso.com" }
}
```

### Example Response

```json
{
  "results": [{
    "chunk_id": "abc-123",
    "document_id": "doc-456",
    "document_title": "Q3 2025 Variance Analysis.xlsx",
    "document_url": "https://contoso.sharepoint.com/sites/finance/Shared%20Documents/Q3%202025%20Variance%20Analysis.xlsx",
    "library": "finance-models",
    "chunk_text": "COGS increased 12% vs budget driven by raw material price escalation in copper (+18% YoY)...",
    "chunk_index": 3,
    "total_chunks": 7,
    "relevance_score": 0.87,
    "metadata": {
      "sheet_name": "COGS Detail",
      "cell_range": "A1:F45",
      "file_type": ".xlsx",
      "last_modified": "2025-10-15T14:30:00Z",
      "dlp_labels": ["confidential"],
      "content_type": "table"
    }
  }],
  "total_matches": 4,
  "query_id": "qry-789",
  "truncated": false
}
```

### Error Handling in `extensions/rag-internal/src/client.ts`

```typescript
// Pseudocode for the RAG client — implement in client.ts
import { fetchWithSsrFGuard } from "../../../../src/infra/net/fetch-guard.js";
import type { SsrFPolicy } from "../../../../src/infra/net/ssrf.js";
import type { RagSearchRequest, RagSearchResponse } from "./types.js";

const RAG_SSRF_POLICY: SsrFPolicy = {
  allowPrivateNetwork: false,
  hostnameAllowlist: [process.env.RAG_ENDPOINT_HOST!],
};

export async function searchRag(
  request: RagSearchRequest,
  delegatedToken: string,
): Promise<RagSearchResponse> {
  const { response, release } = await fetchWithSsrFGuard({
    url: process.env.RAG_ENDPOINT_URL!,
    policy: RAG_SSRF_POLICY,
    init: {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${delegatedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
    timeoutMs: 10_000,
  });

  try {
    if (response.status === 401) { /* re-acquire token, retry once */ }
    if (response.status === 429) { /* exponential backoff, max 3 retries */ }
    if (!response.ok) { /* log error, throw with user-friendly message */ }
    return await response.json() as RagSearchResponse;
  } finally {
    await release();
  }
}
```

---

## B) Model Completion Endpoint

**No new code needed.** OpenClaw's existing provider system handles this natively.

The model call flows through:
1. `src/agents/pi-embedded-runner/run.ts` → `resolveModel()`
2. `src/agents/pi-embedded-runner/model.ts` → `ModelRegistry.find()`
3. `@mariozechner/pi-ai` → `streamSimple()` → HTTP to `model.baseUrl`

The config in doc 02 sets `api: "openai-completions"` which selects the correct wire format for Azure OpenAI. The `apiKey` is read from `authStorage` (populated from env var via config).

### Azure-Specific Notes

Azure OpenAI appends `?api-version=2024-10-21` to the URL path. Verify that `pi-ai`'s `streamSimple()` handles this, or include it in the `baseUrl`:

```
baseUrl: "https://<host>/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21"
```

If `pi-ai` constructs the `/chat/completions` path itself, set:
```
baseUrl: "https://<host>/openai/deployments/<deployment>/"
```

**Test both patterns** during integration to determine which is correct.

---

## C) Excel Helper Endpoints

**Not needed.** All Excel workflows are implemented as skills that compose `rag_search` tool calls + model calls. No separate endpoints or services required. See doc 05 for skill definitions.

---

## Implementation Checklist for `extensions/rag-internal/`

| File | Contents | Status |
|------|----------|--------|
| `openclaw.plugin.json` | `{ "id": "rag-internal", "configSchema": { "type": "object", "properties": {} } }` | Create |
| `package.json` | Extension metadata + deps | Create |
| `index.ts` | `register(api)` → `api.registerService(ragService)` | Create |
| `src/types.ts` | `RagSearchRequest`, `RagSearchResponse`, `RagChunk`, `RagChunkMetadata` (types above) | Create |
| `src/client.ts` | `searchRag()` function using `fetchWithSsrFGuard()` (pseudocode above) | Create |
| `src/auth.ts` | OBO token exchange (see doc 04) | Create |
| `src/prompt.ts` | Extra system prompt text (see doc 07) | Create |
| `src/tool.ts` | Custom tool definition for `rag_search` — schema, handler, response formatting | Create |
