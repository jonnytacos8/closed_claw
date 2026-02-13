# 01 — Scope and Non-Goals

## MVP Scope — Concrete Deliverables for a Coding Agent

### Deliverable 1: Azure-Only Model Routing (Config Only — No Code)

Set `models.mode: "replace"` in `openclaw.json`. This field is defined in `src/config/zod-schema.ts` → `ModelsConfigSchema`. When set to `"replace"`, `resolveImplicitProviders()` in `src/agents/models-config.providers.ts` skips ALL implicit provider discovery — no Anthropic, no OpenAI public, no Gemini, no Ollama, no Copilot, no Bedrock. Only the explicitly declared `azure-internal` provider is available.

```jsonc
{
  "models": {
    "mode": "replace",
    "providers": {
      "azure-internal": {
        "baseUrl": "${AZURE_OPENAI_BASE_URL}",  // Resolved by src/config/env-substitution.ts
        "apiKey": "${AZURE_OPENAI_API_KEY}",
        "api": "openai-completions",             // Wire format — matches Azure OpenAI API
        "models": [{
          "id": "${AZURE_DEPLOYMENT_MODEL_ID}",
          "name": "Internal GPT-4",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "input": ["text"],
          "compat": { "maxTokensField": "max_tokens" }
        }]
      }
    }
  }
}
```

**Validation:** After config is loaded, `discoverModels()` in `src/agents/pi-model-discovery.ts` → `ModelRegistry` should contain exactly one provider. Any call to another provider name fails with "model not found."

### Deliverable 2: Internal RAG Extension (New Code Required)

**Create:** `extensions/rag-internal/` — a new OpenClaw extension.

| File to Create | Purpose | Pattern to Follow |
|----------------|---------|------------------|
| `extensions/rag-internal/openclaw.plugin.json` | Plugin manifest with `"id": "rag-internal"` | `extensions/diagnostics-otel/openclaw.plugin.json` |
| `extensions/rag-internal/index.ts` | Entry — `register(api: OpenClawPluginApi)` registers service | `extensions/diagnostics-otel/index.ts` |
| `extensions/rag-internal/src/client.ts` | HTTP client — `POST /api/v1/search` via `fetchWithSsrFGuard()` | `src/infra/net/fetch-guard.ts` |
| `extensions/rag-internal/src/auth.ts` | OBO token exchange + cache | See doc 04 |
| `extensions/rag-internal/src/types.ts` | TypeScript types for RAG req/res | See doc 06 |
| `extensions/rag-internal/src/prompt.ts` | Extra system prompt (citations, guardrails) | See doc 07 |
| `extensions/rag-internal/package.json` | Extension deps (`undici`, etc.) | Any existing extension |

The extension registers a custom tool `rag_search` that skills can invoke. When called, it:
1. Acquires a delegated user token via OBO (`auth.ts`)
2. Calls the internal RAG endpoint via `fetchWithSsrFGuard()` with `hostnameAllowlist` enforcement (`client.ts`)
3. Returns typed chunks with citations (`types.ts`)

See **doc 03** for the RAG API contract, **doc 04** for the auth flow, **doc 06** for response handling.

### Deliverable 3: 7 MVP Skills (New SKILL.md Files)

**Create:** 7 `SKILL.md` files under a directory loaded by `skills.load.extraDirs`.

**Config:**
```jsonc
{
  "skills": {
    "allowBundled": [],                           // Empty array → ALL 52 bundled skills blocked
                                                  // Checked by isBundledSkillAllowed() in
                                                  // src/agents/skills/config.ts
    "load": {
      "extraDirs": ["/opt/openclaw/mvp-skills/"]  // Scanned by loadSkillsFromDir() in
                                                  // src/agents/skills/workspace.ts
    }
  }
}
```

**SKILL.md frontmatter format** (derived from `skills/oracle/SKILL.md` and `skills/slack/SKILL.md`):
```yaml
---
name: <skill-name>
description: <one-line description>
metadata: { "openclaw": { "emoji": "...", "requires": { } } }
---
```

See **doc 05** for the exact 7 skills, their names, descriptions, and full Markdown content.

### Deliverable 4: Tool Policy Lockdown (Config Only)

```jsonc
{
  "tools": {
    "sandbox": {
      "tools": {
        "allow": ["rag_search"],
        "deny": ["exec", "process", "browser", "canvas", "nodes", "cron", "gateway"]
      }
    }
  }
}
```

**How it works:** `isToolAllowed()` in `src/agents/sandbox/tool-policy.ts` — deny checked first (supports `*` wildcards), then allow. Default constants in `src/agents/sandbox/constants.ts` include `DEFAULT_TOOL_ALLOW` and `DEFAULT_TOOL_DENY` — our config overrides both.

### Deliverable 5: Teams Channel Config (Config Only)

```jsonc
{
  "channels": {
    "msteams": {
      "enabled": true,
      "appId": "${MSTEAMS_APP_ID}",              // Falls back to env var per
      "appPassword": "${MSTEAMS_APP_PASSWORD}",   // extensions/msteams/src/token.ts
      "tenantId": "${MSTEAMS_TENANT_ID}",         // resolveMSTeamsCredentials()
      "dmPolicy": "allowlist",                    // DmPolicy type in src/config/types.msteams.ts
      "allowFrom": [],                            // AAD object IDs of pilot users
      "groupPolicy": "disabled",                  // GroupPolicy type
      "webhook": { "port": 3978 }
    }
  }
}
```

### Deliverable 6: Observability (Modify Existing or Add to New Extension)

Emit structured trace events via `emitDiagnosticEvent()` and/or `createSubsystemLogger()` (both exported from `src/plugin-sdk/index.ts`). If `diagnostics-otel` is enabled, events auto-export to OTLP. Otherwise, write to JSON log files.

See **doc 10** for trace event schema.

### Deliverable 7: Container Deployment Config

Modify existing `docker-compose.yml` or create an override:
- Mount `openclaw.json` to container
- Mount MVP skills directory
- Set env vars from `.env`
- Network egress restrictions (only Azure endpoint, RAG endpoint, `login.microsoftonline.com`, Bot Framework IPs)

---

## Non-Goals — What NOT to Build

| Non-Goal | Codebase Implication |
|----------|---------------------|
| Excel add-in (Office.js) | Do not create any Office.js code. Phase 2. |
| File upload skill | Do not add upload/file-processing skill to allowlist |
| Multi-model failover | Do not set `agents.defaults.model.fallbacks` |
| User-authored skills | `skills.allowBundled: []` enforces; do not create skill-install UI |
| Voice / media / Canvas | Do not enable TTS config, image model, or canvas |
| Channels other than Teams | Only `channels.msteams` gets `enabled: true` |
| DLP response blocking | Log `dlp_labels` from RAG metadata only; no filtering logic |
| Web browsing | `deny: ["browser"]` in tool policy; do not enable browser extension |
| Multi-agent routing | Do not configure `agents.list[]` with multiple entries |
| Built-in memory/vector search | Not used; RAG extension replaces it. Do not configure `memorySearch` |
