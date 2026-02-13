# 00 — MVP Goals: Azure-Routed OpenClaw for Finance/Ops

## Why Now

Finance/ops teams upload confidential Excel data to public LLMs. This MVP locks down an OpenClaw instance so **all model + RAG calls route to internal Azure endpoints**, then ships 7 finance-specific skills that beat the "paste into Claude" workflow.

## Success Metrics (2–4 Week Pilot)

| Metric | Target | Measured Via |
|--------|--------|-------------|
| External upload displacement | ≥40% reduction (self-reported) | Pre/post survey of pilot group |
| Requests handled internally | ≥80% completed end-to-end | Trace logs: `event_type=request_complete` vs `request_error` |
| Time saved per user per day | ≥15 min on Excel workflows | User diary study + `request.latency_total_ms` telemetry |
| Weekly active users | ≥60% of 20–30 pilot group | Distinct `hashed_user_id` per week in traces |
| Privilege violations | 0 | RAG audit logs: zero results returned for inaccessible docs |
| Data egress to unapproved endpoints | 0 | Container network logs + `error.code=egress_blocked` count |
| p95 response latency | ≤8s single-turn | Trace `request.latency_total_ms` percentiles |

## Assumptions

| ID | Assumption | Validated By |
|----|-----------|-------------|
| A1 | Internal Azure OpenAI endpoint is provisioned, supports `openai-completions` API, ≥128k context | Azure/Cloud team confirms deployment details |
| A2 | Internal RAG service indexes target SharePoint libraries and enforces security trimming via delegated auth tokens | RAG team confirms API contract and provides test credentials |
| A3 | Teams bot registration (`appId`/`appPassword`/`tenantId`) is available | Teams admin provides credentials |
| A4 | Pilot group of 20–30 finance/ops users identified | Sponsor provides list |
| A5 | OpenClaw Docker deployment infra available (existing `Dockerfile` at repo root) | Platform team confirms hosting environment |

## Implementation Completion Checklist

The MVP is done when a coding agent has delivered all of the following. Each item references the doc that specifies it in detail.

- [ ] `openclaw.json` has `models.mode: "replace"` with a single `azure-internal` provider — prevents `resolveImplicitProviders()` (`src/agents/models-config.providers.ts`) from discovering any public providers. See **doc 02** for full config.
- [ ] New extension `extensions/rag-internal/` exists and registers a `rag_search` custom tool via `api.registerService()` (pattern: `extensions/diagnostics-otel/`). See **doc 03** for API contract, **doc 06** for response schema.
- [ ] OBO token exchange module exists in `extensions/rag-internal/src/auth.ts` — exchanges Teams SSO token for delegated user token scoped to the RAG service. See **doc 04** for full identity flow.
- [ ] 7 `SKILL.md` files exist under the MVP skills directory, each with YAML frontmatter following the pattern in `skills/oracle/SKILL.md` or `skills/slack/SKILL.md`. See **doc 05** for exact skill list and frontmatter.
- [ ] Config sets `skills.allowBundled: []` (blocks all 52 bundled skills via `isBundledSkillAllowed()` in `src/agents/skills/config.ts`) and `skills.load.extraDirs` points to MVP skills directory. See **doc 05**.
- [ ] Config sets `tools.sandbox.tools.deny` to block all tools except `rag_search` via `isToolAllowed()` in `src/agents/sandbox/tool-policy.ts`. See **doc 05**.
- [ ] `channels.msteams` configured with `dmPolicy: "allowlist"`, `allowFrom` populated with pilot AAD object IDs, `groupPolicy: "disabled"`. Credential fields use `${ENV_VAR}` syntax resolved by `src/config/env-substitution.ts`. See **doc 02**.
- [ ] System prompt additions for citation enforcement and prompt-injection resistance are injected via the `rag-internal` extension (appended to `extraSystemPrompt` or via skill instructions). See **doc 07**.
- [ ] Structured trace logging emits JSON events matching the schema in **doc 10**, using `createSubsystemLogger()` from `src/logging/subsystem.ts` and/or `emitDiagnosticEvent()` from `src/plugin-sdk/index.ts`.
- [ ] Container deployment config (Dockerfile/compose override) mounts `openclaw.json`, `.env`, and MVP skills dir; enforces network egress restrictions. See **doc 02**.
- [ ] All 5 core Excel workflows (variance, GL mapping, summary, commentary, sanity check) produce end-to-end responses with SharePoint `webUrl` citations. See **doc 08**.
