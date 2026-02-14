# T6 — Config, Environment, and Deployment

## Goal

Create the locked-down `openclaw.json` config, `.env` template, and Docker Compose adjustments that wire everything together. After this task, the full MVP is deployable as a single container with all security controls active.

## Prerequisites

- **T1–T5** completed (extension, types, client, auth, tool, prompt, skills all exist).
- This is the final task — it references all prior deliverables.

## Files to Create

### 1. `deploy/openclaw.json`

This is the complete, locked-down OpenClaw configuration. Every setting is intentional.

```jsonc
{
  // === MODEL: Single Azure provider, all others disabled ===
  // models.mode: "replace" is defined in src/config/zod-schema.ts → ModelsConfigSchema
  // When set, resolveImplicitProviders() in src/agents/models-config.providers.ts
  // skips ALL implicit provider discovery — no Anthropic, no OpenAI, no Gemini, etc.
  "models": {
    "mode": "replace",
    "providers": {
      "azure-internal": {
        "baseUrl": "${AZURE_OPENAI_BASE_URL}",
        "apiKey": "${AZURE_OPENAI_API_KEY}",
        "api": "openai-completions",
        "models": [
          {
            "id": "${AZURE_DEPLOYMENT_MODEL_ID}",
            "name": "Internal GPT-4",
            "contextWindow": 128000,
            "maxTokens": 4096,
            "input": ["text"],
            "reasoning": false,
            "compat": {
              "supportsStore": false,
              "supportsDeveloperRole": false,
              "maxTokensField": "max_tokens"
            }
          }
        ]
      }
    }
  },

  // === CHANNEL: Teams only, allowlisted users ===
  // Config types in src/config/types.msteams.ts
  // Credentials resolved by resolveMSTeamsCredentials() in extensions/msteams/src/token.ts
  // ${...} syntax resolved by src/config/env-substitution.ts
  "channels": {
    "msteams": {
      "enabled": true,
      "appId": "${MSTEAMS_APP_ID}",
      "appPassword": "${MSTEAMS_APP_PASSWORD}",
      "tenantId": "${MSTEAMS_TENANT_ID}",
      "dmPolicy": "allowlist",
      "allowFrom": [],
      "groupPolicy": "disabled",
      "webhook": {
        "port": 3978
      }
    }
  },

  // === SKILLS: Only MVP skills from extraDirs, all bundled blocked ===
  // skills.allowBundled: [] → isBundledSkillAllowed() in src/agents/skills/config.ts
  //   rejects ALL 52 bundled skills
  // skills.load.extraDirs → loadSkillsFromDir() in src/agents/skills/workspace.ts
  //   scans /opt/openclaw/mvp-skills/ for SKILL.md files
  "skills": {
    "allowBundled": [],
    "load": {
      "extraDirs": ["/opt/openclaw/mvp-skills/"]
    }
  },

  // === TOOLS: Only rag_search allowed ===
  // Enforced by isToolAllowed() in src/agents/sandbox/tool-policy.ts
  // Deny is checked FIRST (supports * wildcards), then allow
  "tools": {
    "sandbox": {
      "tools": {
        "allow": ["rag_search"],
        "deny": ["exec", "process", "browser", "canvas", "nodes", "cron", "gateway"]
      }
    }
  },

  // === AGENT: Use Azure model as primary ===
  "agents": {
    "defaults": {
      "model": {
        "primary": "azure-internal/${AZURE_DEPLOYMENT_MODEL_ID}"
      }
    }
  }
}
```

**Critical config validations a coding agent should verify:**

| Setting | Why | What Breaks If Wrong |
|---------|-----|---------------------|
| `models.mode: "replace"` | Disables all implicit provider discovery | Public LLM endpoints become reachable |
| `skills.allowBundled: []` | Blocks all 52 bundled skills | Built-in skills (exec, browser, etc.) become available |
| `tools.sandbox.tools.deny` list | Blocks dangerous tool categories | Agent could execute code, browse web, etc. |
| `channels.msteams.dmPolicy: "allowlist"` | Only pilot users can talk to bot | Anyone in the tenant could use it |
| `channels.msteams.allowFrom: []` | MUST be populated with pilot user AAD Object IDs before deploy | No users can talk to the bot |

### 2. `deploy/.env.template`

Template for the `.env` file. Actual values are provided by ops/admin.

```bash
# ============================================================
# OpenClaw MVP — Environment Variables
# Copy this file to .env and fill in actual values
# ============================================================

# --- Azure OpenAI ---
# Base URL for the Azure OpenAI deployment
# Format: https://<resource>.openai.azure.com/openai/deployments/<deployment>/
# Include trailing slash. The api-version may need to be appended depending
# on how pi-ai constructs the URL — test both:
#   Option A: https://host/openai/deployments/deploy/
#   Option B: https://host/openai/deployments/deploy/chat/completions?api-version=2024-10-21
AZURE_OPENAI_BASE_URL=

# API key for Azure OpenAI (from Azure portal → resource → Keys and Endpoint)
AZURE_OPENAI_API_KEY=

# Model deployment ID (the name you gave the deployment in Azure)
AZURE_DEPLOYMENT_MODEL_ID=

# --- Internal RAG Service ---
# Full URL for the RAG search endpoint
RAG_ENDPOINT_URL=https://rag-host.internal/api/v1/search

# Hostname only (for SSRF allowlist — no protocol, no path)
RAG_ENDPOINT_HOST=rag-host.internal

# --- Azure AD (OBO Token Exchange) ---
# Bot's Azure AD app registration client ID
AAD_CLIENT_ID=

# Bot's Azure AD app registration client secret
AAD_CLIENT_SECRET=

# Azure AD tenant ID
AAD_TENANT_ID=

# Target scope for the delegated token (RAG service audience)
# Format: api://<rag-app-registration-id>/.default
RAG_SERVICE_SCOPE=

# --- Microsoft Teams Bot ---
# Bot Framework app ID (same as AAD_CLIENT_ID in most setups)
MSTEAMS_APP_ID=

# Bot Framework app password (same as AAD_CLIENT_SECRET in most setups)
MSTEAMS_APP_PASSWORD=

# Tenant ID (same as AAD_TENANT_ID)
MSTEAMS_TENANT_ID=
```

### 3. Docker Compose Override — `deploy/docker-compose.override.yml`

This overrides/extends the existing `docker-compose.yml` at the repo root.

```yaml
# docker-compose.override.yml for MVP deployment
# Place in deploy/ and run: docker compose -f ../docker-compose.yml -f docker-compose.override.yml up

services:
  openclaw:
    # Mount the locked-down config
    volumes:
      - ./openclaw.json:/opt/openclaw/openclaw.json:ro
      - ../mvp-skills:/opt/openclaw/mvp-skills:ro
      # Sessions directory (persistent across restarts)
      - openclaw-sessions:/opt/openclaw/sessions
      # Logs directory
      - openclaw-logs:/opt/openclaw/logs

    # Load environment variables
    env_file:
      - .env

    # Expose the Teams webhook port
    ports:
      - "3978:3978"

    # Network egress restrictions
    # In production, use a Docker network policy or Kubernetes NetworkPolicy
    # to restrict outbound connections. The container should ONLY reach:
    #   1. Azure OpenAI endpoint (from AZURE_OPENAI_BASE_URL)
    #   2. RAG service (from RAG_ENDPOINT_HOST)
    #   3. login.microsoftonline.com (for OBO token exchange)
    #   4. Bot Framework Service IPs (for Teams message delivery)
    #      See: https://learn.microsoft.com/en-us/azure/bot-service/bot-service-resources-faq-security
    #
    # Example iptables-based restriction (run on host or in init container):
    # iptables -A OUTPUT -d <azure-openai-ip> -j ACCEPT
    # iptables -A OUTPUT -d <rag-host-ip> -j ACCEPT
    # iptables -A OUTPUT -d login.microsoftonline.com -j ACCEPT
    # iptables -A OUTPUT -d <botframework-ips> -j ACCEPT
    # iptables -A OUTPUT -j DROP

    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3978/api/messages"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  openclaw-sessions:
  openclaw-logs:
```

### 4. Populate `channels.msteams.allowFrom` (Documentation)

The `allowFrom` array in `openclaw.json` must contain the Azure AD Object IDs of pilot users. These are NOT email addresses — they are UUIDs from Azure AD.

To get a user's AAD Object ID:

```bash
# Using Azure CLI
az ad user show --id jane.doe@contoso.com --query id -o tsv

# Or from Microsoft Graph API
GET https://graph.microsoft.com/v1.0/users/jane.doe@contoso.com?$select=id
```

Update the config before deployment:

```jsonc
"allowFrom": [
  "12345678-aaaa-bbbb-cccc-111111111111",  // Jane Doe
  "12345678-aaaa-bbbb-cccc-222222222222",  // John Smith
  // ... up to 30 pilot users
]
```

## Network Egress Summary

The container needs outbound access to exactly these hosts:

| Host | Purpose | Port |
|------|---------|------|
| `${AZURE_OPENAI_BASE_URL}` hostname | Model completions | 443 |
| `${RAG_ENDPOINT_HOST}` | Document search | 443 |
| `login.microsoftonline.com` | OBO token exchange | 443 |
| Bot Framework Service IPs | Teams message relay | 443 |

Everything else should be blocked at the network level.

**Application-level enforcement:** The SSRF guard in `src/infra/net/ssrf.ts` blocks private IPs, localhost, and metadata endpoints by default. The `hostnameAllowlist` in the RAG client (T2) restricts `fetchWithSsrFGuard()` calls to the RAG host only.

## Verification

1. `openclaw.json` passes validation by `src/config/zod-schema.ts` schemas.
2. `models.mode` is `"replace"` — verify that `resolveImplicitProviders()` returns zero implicit providers.
3. `skills.allowBundled` is `[]` — verify that `isBundledSkillAllowed()` returns false for any bundled skill name.
4. `tools.sandbox.tools.deny` blocks all dangerous tools — verify `isToolAllowed(policy, "exec")` returns false.
5. `tools.sandbox.tools.allow` includes `rag_search` — verify `isToolAllowed(policy, "rag_search")` returns true.
6. All `${...}` placeholders resolve from the `.env` file via `src/config/env-substitution.ts`.
7. The container starts with the mounted config and skills directory.
8. The Teams webhook is reachable on port 3978.
9. `allowFrom` is populated with at least one test user's AAD Object ID.

## What This Does NOT Include

- Kubernetes manifests or AKS config (post-MVP — see OQ-14)
- CI/CD pipeline
- TLS termination / reverse proxy config (see OQ-12)
- Monitoring/alerting infrastructure (dashboards from doc 10 are log-backend-specific)

## Estimated Scope

3 files (openclaw.json, .env.template, docker-compose.override.yml), ~120 lines total.
