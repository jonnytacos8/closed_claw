# 10 — Observability

## Implementation Target

**Logging:** Use `createSubsystemLogger("rag-internal")` from `src/logging/subsystem.ts` (exported via `src/plugin-sdk/index.ts`) for structured logging in the RAG extension.

**Diagnostics:** Use `emitDiagnosticEvent()` from `src/plugin-sdk/index.ts` for metrics that the `diagnostics-otel` extension can export to OTLP. Event types include `model.usage`, `run.attempt`, etc.

**OTel:** If OTLP endpoint is available, enable `extensions/diagnostics-otel/` and configure `diagnostics.otel.endpoint` in config. The extension subscribes to `onDiagnosticEvent` and records metrics like `openclaw.tokens`, `openclaw.cost.usd`, `openclaw.run.duration_ms`.

**Log transport:** For custom log sinks, use `registerLogTransport(transport: LogTransport)` which returns an unsubscribe function. Transports receive `LogTransportRecord` objects.

## Overview

MVP observability focuses on operational visibility, security auditing, and usage measurement — with strict boundaries on what we log to avoid storing sensitive document content or PII.

## What to Log

### Trace Event Schema

Every request-response cycle emits a structured trace event:

```json
{
  "trace_id": "uuid-v4",
  "timestamp": "2025-11-15T14:30:00.000Z",
  "event_type": "request_complete",
  "hashed_user_id": "sha256(aadObjectId)",
  "session_id": "openclaw-session-id",
  "channel": "msteams",

  "skill": {
    "name": "excel-variance-analysis",
    "invocation_id": "uuid-v4"
  },

  "rag": {
    "query_id": "rag-service-query-id",
    "document_ids": ["sp-item-id-1", "sp-item-id-2"],
    "chunk_count": 5,
    "libraries_searched": ["finance-models"],
    "latency_ms": 320,
    "status": "success"
  },

  "model": {
    "provider": "azure-internal",
    "model_id": "deployment-model-id",
    "prompt_tokens": 1200,
    "completion_tokens": 350,
    "total_tokens": 1550,
    "latency_first_token_ms": 890,
    "latency_total_ms": 3200,
    "finish_reason": "stop",
    "content_filter_triggered": false,
    "status": "success"
  },

  "request": {
    "turn_count": 1,
    "conversation_length": 3,
    "latency_total_ms": 4100
  },

  "auth": {
    "method": "obo_delegated",
    "token_age_seconds": 120,
    "status": "success"
  },

  "error": null
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `trace_id` | UUID | Unique identifier for the full request lifecycle. Correlates OpenClaw, RAG, and model calls. |
| `timestamp` | ISO 8601 | When the trace event was emitted (request completion time). |
| `event_type` | enum | `request_complete`, `request_error`, `auth_failure`, `rag_error`, `model_error`, `content_filter` |
| `hashed_user_id` | string | SHA-256 hash of the Azure AD Object ID. Enables usage analytics without storing PII. |
| `session_id` | string | OpenClaw session identifier. Groups related turns in a conversation. |
| `channel` | string | Always `msteams` for MVP. |
| `skill.name` | string | Which skill was invoked (or `none` for general Q&A). |
| `skill.invocation_id` | UUID | Unique per skill invocation. |
| `rag.query_id` | string | Correlation ID from the RAG service response. |
| `rag.document_ids` | string[] | SharePoint item IDs of documents whose chunks were returned. **Not** document content. |
| `rag.chunk_count` | integer | Number of chunks returned. |
| `rag.libraries_searched` | string[] | Which SharePoint libraries were queried. |
| `rag.latency_ms` | integer | RAG service response time. |
| `model.prompt_tokens` | integer | Token count for the full prompt sent to the model. |
| `model.completion_tokens` | integer | Token count for the model's response. |
| `model.latency_first_token_ms` | integer | Time to first token (streaming). |
| `model.latency_total_ms` | integer | Total model response time. |
| `model.finish_reason` | enum | `stop`, `length`, `content_filter` |
| `model.content_filter_triggered` | boolean | Whether Azure content filter intervened. |
| `request.turn_count` | integer | Which turn in the conversation this request represents. |
| `request.conversation_length` | integer | Total turns in the conversation so far. |
| `request.latency_total_ms` | integer | End-to-end latency from message receipt to response delivery. |
| `auth.method` | string | `obo_delegated`, `cached_token`, `token_refresh` |
| `auth.token_age_seconds` | integer | Age of the cached delegated token at time of use. |
| `error` | object/null | Error details if `event_type` is an error variant. Contains `code`, `message` (sanitized), `component`. |

## What NOT to Log

| Data | Reason | Alternative |
|------|--------|-------------|
| Raw document text / chunk content | Contains confidential financial data | Log `document_ids` and `chunk_count` only |
| Full prompt text | Contains system prompt + RAG chunks + user message — all sensitive | Log `prompt_tokens` count only |
| Full model response text | Contains synthesized document content | Log `completion_tokens` count and `finish_reason` |
| User's original message text | PII; may contain sensitive financial questions | Log `skill.name` and `request.turn_count` for usage patterns |
| User's display name or email | PII | Use `hashed_user_id` only |
| Delegated auth tokens | Security — could be replayed | Log `auth.method` and `auth.token_age_seconds` |
| IP addresses | Not needed; internal-only deployment | Omit |
| Azure API keys or secrets | Security | Never log; mask in error messages |
| SharePoint document URLs | Could leak document titles/paths to log viewers without SharePoint access | Log `document_ids` (opaque IDs) only |

## Error Event Schema

When an error occurs, the `error` field is populated:

```json
{
  "error": {
    "code": "rag_timeout",
    "message": "RAG service did not respond within 10000ms",
    "component": "rag",
    "retries_attempted": 2,
    "user_message_shown": "I'm having trouble accessing documents right now. Please try again."
  }
}
```

Error codes:

| Code | Component | Description |
|------|-----------|-------------|
| `auth_sso_unavailable` | auth | Teams SSO token not available |
| `auth_obo_failed` | auth | On-behalf-of token exchange failed |
| `auth_token_expired` | auth | Delegated token expired and refresh failed |
| `auth_upn_mismatch` | auth | UPN in token doesn't match request — security event |
| `rag_timeout` | rag | RAG service exceeded timeout |
| `rag_auth_failed` | rag | RAG rejected the delegated token |
| `rag_internal_error` | rag | RAG returned 500 |
| `rag_rate_limited` | rag | RAG returned 429 after retries |
| `model_timeout` | model | Azure endpoint exceeded timeout |
| `model_auth_failed` | model | Azure endpoint rejected API key |
| `model_rate_limited` | model | Azure endpoint returned 429 after retries |
| `model_content_filter` | model | Azure content filter blocked the response |
| `model_context_overflow` | model | Prompt exceeded context window after budgeting |
| `skill_not_allowed` | skill | Attempted to invoke a skill not on the allowlist |
| `egress_blocked` | network | SSRF guard blocked an outbound request |

## Minimal Dashboards

### Dashboard 1: Usage Overview

| Panel | Visualization | Query |
|-------|--------------|-------|
| Requests per day | Time series line chart | Count of `event_type=request_complete` grouped by day |
| Unique users per day | Time series line chart | Distinct `hashed_user_id` per day |
| Top skills | Bar chart | Count by `skill.name`, last 7 days |
| Conversations per user | Histogram | Count of distinct `session_id` per `hashed_user_id` |
| Multi-turn depth | Histogram | Distribution of `request.conversation_length` |

### Dashboard 2: Performance

| Panel | Visualization | Query |
|-------|--------------|-------|
| p50/p95/p99 end-to-end latency | Time series with percentile bands | Percentiles of `request.latency_total_ms` |
| p50/p95 RAG latency | Time series | Percentiles of `rag.latency_ms` |
| p50/p95 model latency (first token) | Time series | Percentiles of `model.latency_first_token_ms` |
| p50/p95 model latency (total) | Time series | Percentiles of `model.latency_total_ms` |
| Token usage per request | Time series | Average `model.total_tokens` per day |
| Content filter triggers | Counter | Count of `model.content_filter_triggered=true` |

### Dashboard 3: Errors & Security

| Panel | Visualization | Query |
|-------|--------------|-------|
| Error rate | Time series (% of total requests) | Count of `event_type` matching `*_error` / total requests |
| Errors by component | Stacked bar | Count by `error.component` |
| Auth failures | Time series | Count of `event_type=auth_failure` |
| UPN mismatch events | Counter (should be 0) | Count of `error.code=auth_upn_mismatch` |
| Egress block events | Counter (should be 0 in normal operation) | Count of `error.code=egress_blocked` |
| Skill-not-allowed attempts | Counter | Count of `error.code=skill_not_allowed` |

## Alerting

### MVP Alerts (Minimum Viable)

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| **Auth failure spike** | >5 `auth_failure` events in 10 minutes | High | Investigate token/SSO issues. May indicate Azure AD configuration problem. |
| **UPN mismatch** | Any `auth_upn_mismatch` event | Critical | Potential identity spoofing. Investigate immediately. |
| **Egress block** | Any `egress_blocked` event | High | Either a misconfigured skill or an attack attempt. Review the blocked destination. |
| **RAG unavailable** | >3 consecutive `rag_timeout` or `rag_internal_error` | High | RAG service may be down. Check RAG service health. |
| **Model unavailable** | >3 consecutive `model_timeout` or `model_auth_failed` | High | Azure endpoint may be down or API key rotated. |
| **Error rate >10%** | Error events / total events > 10% over 15 minutes | Medium | General degradation. Investigate top error codes. |
| **Content filter spike** | >10 `content_filter` events in 1 hour | Medium | Unusual — may indicate prompt injection attempts or problematic document content. |
| **Zero traffic** | 0 requests for >2 hours during business hours (8am–6pm) | Low | Bot may be down or disconnected from Teams. |

## Log Retention

| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| Trace events | 90 days | Sufficient for trend analysis and incident investigation |
| Error events | 180 days | Longer retention for security audit trail |
| Auth failure events | 365 days | Security compliance requirement |
| Aggregated metrics | 2 years | Long-term usage trends |

## Implementation Notes

OpenClaw already has logging infrastructure (`src/logging/`) and an optional OpenTelemetry extension (`extensions/diagnostics-otel/`). For MVP:

- Use the existing structured logging transport to emit trace events as JSON lines.
- If the internal observability stack supports OpenTelemetry, enable the `diagnostics-otel` extension and configure the OTLP exporter endpoint.
- If not, write JSON logs to `/opt/openclaw/logs/traces.jsonl` and ingest with whatever log pipeline is available (Splunk, ELK, Azure Monitor, etc.).
- Dashboard tooling depends on the log backend. The queries above are backend-agnostic.
