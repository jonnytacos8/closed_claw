# 03 — Internal Service Interfaces

This document defines the service interfaces OpenClaw will call in the MVP. All endpoints are internal — no public internet egress.

---

## A) RAG Query Endpoint

The internal RAG service indexes SharePoint and enforces user-level security trimming. OpenClaw calls it to retrieve relevant document chunks for a user's query.

### Contract

| Field | Value |
|-------|-------|
| **Protocol** | HTTPS (internal TLS) |
| **Method** | `POST` |
| **Path** | `/api/v1/search` |
| **Authentication** | `Authorization: Bearer <delegated_user_token>` (on-behalf-of token scoped to the RAG service) |
| **Content-Type** | `application/json` |
| **Timeout** | 10s (OpenClaw-side; configurable) |

### Request

```json
{
  "query": "What drove the variance in Q3 COGS vs budget?",
  "filters": {
    "libraries": ["finance-models", "budget-2025"],
    "file_types": [".xlsx", ".csv", ".docx", ".pdf"],
    "modified_after": "2025-01-01T00:00:00Z"
  },
  "max_results": 10,
  "include_citations": true,
  "user_context": {
    "upn": "jane.doe@contoso.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `filters.libraries` | string[] | No | Scoped SharePoint document library names. If omitted, searches all libraries the user has access to. |
| `filters.file_types` | string[] | No | File extension filter |
| `filters.modified_after` | ISO 8601 | No | Recency filter |
| `max_results` | integer | No | Max chunks to return (default 10, max 25) |
| `include_citations` | boolean | No | Whether to return `webUrl` for each source |
| `user_context.upn` | string | Yes | User principal name, used for security trimming if token-based trimming is supplemented by explicit UPN |

### Response

```json
{
  "results": [
    {
      "chunk_id": "abc-123",
      "document_id": "doc-456",
      "document_title": "Q3 2025 Variance Analysis.xlsx",
      "document_url": "https://contoso.sharepoint.com/sites/finance/Shared%20Documents/Q3%202025%20Variance%20Analysis.xlsx",
      "library": "finance-models",
      "chunk_text": "COGS increased 12% vs budget driven by raw material price escalation in copper (+18% YoY) and logistics surcharges...",
      "chunk_index": 3,
      "total_chunks": 7,
      "relevance_score": 0.87,
      "metadata": {
        "sheet_name": "COGS Detail",
        "cell_range": "A1:F45",
        "file_type": ".xlsx",
        "last_modified": "2025-10-15T14:30:00Z",
        "dlp_labels": ["confidential"]
      }
    }
  ],
  "total_matches": 4,
  "query_id": "qry-789",
  "truncated": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results[].chunk_id` | string | Unique chunk identifier |
| `results[].document_id` | string | SharePoint item ID |
| `results[].document_title` | string | Human-readable document name |
| `results[].document_url` | string | SharePoint `webUrl` — used for citations |
| `results[].library` | string | Source library name |
| `results[].chunk_text` | string | Extracted text content (max ~2000 chars) |
| `results[].chunk_index` | integer | Position of this chunk within the document |
| `results[].total_chunks` | integer | Total chunks for this document |
| `results[].relevance_score` | float | 0.0–1.0 relevance score |
| `results[].metadata` | object | File-type-specific metadata (sheet name, cell range for Excel; page number for PDF, etc.) |
| `results[].metadata.dlp_labels` | string[] | DLP sensitivity labels if present |
| `total_matches` | integer | Total matching chunks before `max_results` cap |
| `query_id` | string | Correlation ID for RAG-side audit logging |
| `truncated` | boolean | Whether results were capped |

### Error Responses

| HTTP Status | Meaning | OpenClaw Handling |
|-------------|---------|-------------------|
| 401 | Delegated token expired or invalid | Re-acquire token via OBO flow; if still fails, surface "Session expired, please re-authenticate" to user |
| 403 | User lacks access to all matched documents | Return "I couldn't find any documents you have access to for this query" |
| 429 | Rate limited | Retry with exponential backoff (2s, 4s, 8s); max 3 retries |
| 500 | RAG service error | Return "I'm having trouble searching documents right now. Please try again." Log `query_id` for debugging. |

---

## B) Model Completion Endpoint

The internal Azure OpenAI endpoint provides LLM completions. OpenClaw's provider system routes here via `models.providers.azure-internal.baseUrl`.

### Contract

| Field | Value |
|-------|-------|
| **Protocol** | HTTPS (internal TLS) |
| **Method** | `POST` |
| **Path** | `/openai/deployments/<deployment-name>/chat/completions?api-version=2024-10-21` |
| **Authentication** | `api-key` header or `Authorization: Bearer <managed_identity_token>` |
| **Content-Type** | `application/json` |
| **Streaming** | `"stream": true` for real-time token delivery |
| **Timeout** | 60s (OpenClaw-side) |

### Request

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a financial analyst assistant. You answer questions using ONLY the provided context from internal documents. Always cite your sources using [DocTitle](URL) format. If the context does not contain enough information, say so explicitly. Never fabricate data or figures."
    },
    {
      "role": "user",
      "content": "Based on the following documents:\n\n[1] Q3 2025 Variance Analysis.xlsx (COGS Detail, A1:F45):\nCOGS increased 12% vs budget driven by raw material price escalation in copper (+18% YoY)...\n\n---\n\nUser question: What drove the Q3 COGS variance?"
    }
  ],
  "max_tokens": 2048,
  "temperature": 0.2,
  "stream": true
}
```

### Response (Streaming SSE)

```
data: {"choices":[{"delta":{"role":"assistant","content":""},"index":0}]}

data: {"choices":[{"delta":{"content":"The Q3 COGS variance"},"index":0}]}

data: {"choices":[{"delta":{"content":" was primarily driven by..."},"index":0}]}

...

data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":1200,"completion_tokens":350,"total_tokens":1550}}

data: [DONE]
```

OpenClaw's existing provider system (`openai-completions` API type) already handles this SSE streaming format natively.

### Error Responses

| HTTP Status | Meaning | OpenClaw Handling |
|-------------|---------|-------------------|
| 401 | API key invalid or managed identity token expired | Log error; surface "Service configuration error" to user; alert ops |
| 429 | Token rate limit or request rate limit | Retry with backoff; surface "I'm temporarily busy" if all retries fail |
| 400 | Invalid request (token overflow, etc.) | Truncate context and retry; if still fails, surface "Your question requires too much context" |
| 500/503 | Azure endpoint error | Retry 2x; surface "Service temporarily unavailable" |

---

## C) Excel Helper Endpoints (Optional — Evaluate for MVP)

These are convenience endpoints that could be implemented as thin wrappers around the model endpoint, or as dedicated microservices. **For MVP, we recommend implementing these as skills that compose RAG + model calls rather than separate endpoints.**

### C1. Formula Explain

**Implemented as:** Skill (`excel-formula-explain`) — no separate endpoint needed. The skill constructs a prompt with the formula and sends it to the model endpoint.

### C2. Table Transform

**Implemented as:** Skill (`excel-table-transform`) — takes a description of the desired transformation, retrieves the relevant table via RAG, and asks the model to produce the transformed output.

### C3. Variance Narrative

**Implemented as:** Skill (`excel-variance-analysis`) — retrieves budget vs. actual data via RAG, sends to model with narrative generation prompt.

**Recommendation:** No separate "Excel helper" endpoints for MVP. Skills compose the existing RAG + model interfaces. This avoids deploying additional services and keeps the architecture simple.

---

## Interface Summary

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Teams      │────▶│   OpenClaw        │────▶│ Internal RAG      │
│   (User)     │     │   Gateway + Agent  │     │ POST /api/v1/search│
└─────────────┘     │                    │     └───────────────────┘
                    │                    │
                    │                    │────▶┌───────────────────┐
                    │                    │     │ Azure OpenAI      │
                    │                    │     │ POST /openai/...  │
                    └──────────────────┘     │ /chat/completions │
                                              └───────────────────┘
```

Only two external (to OpenClaw) service dependencies. Both internal to our network.
