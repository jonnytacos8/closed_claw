# 05 — Skills and Sandboxing

## Overview

OpenClaw's skills framework loads skills from `SKILL.md` files with YAML frontmatter (see `src/agents/skills/`). Skills are behavioral instructions that teach the agent how to use tools and compose RAG + model calls for specific tasks.

For the MVP, we ship a **strict allowlist** of 7 skills. All other bundled skills (52 total in the default distribution) are disabled. No user-authored skills are permitted.

## MVP Skill Allowlist

### 1. `excel-formula-explain`

| Field | Value |
|-------|-------|
| **Purpose** | Explain what an Excel formula does in plain English. Identify potential errors or edge cases. |
| **Inputs** | Formula string (e.g., `=VLOOKUP(A2,Sheet2!$A:$D,4,FALSE)`), optional context about the workbook |
| **Outputs** | Plain-English explanation, step-by-step breakdown, warnings about common pitfalls |
| **Risk Level** | Low — no data access, no egress. Pure model call. |
| **Egress** | Azure model endpoint only |
| **RAG Required** | No |

### 2. `excel-table-summarize`

| Field | Value |
|-------|-------|
| **Purpose** | Summarize a table or dataset from a SharePoint-hosted Excel file. Identify key trends, outliers, totals. |
| **Inputs** | Document reference (file name, library, optional sheet/range), summary focus (e.g., "top 5 expense categories") |
| **Outputs** | Structured summary with key figures, trends, and citations to source document |
| **Risk Level** | Medium — accesses user data via RAG. Security trimming critical. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Yes — retrieves table chunks from SharePoint-indexed Excel files |

### 3. `excel-variance-analysis`

| Field | Value |
|-------|-------|
| **Purpose** | Compare budget vs. actual figures, identify and explain material variances. |
| **Inputs** | Reference to budget and actual data (file names or library scope), materiality threshold (e.g., ">5% or >$50K") |
| **Outputs** | Variance table, narrative explanation of material variances, cited sources |
| **Risk Level** | Medium — accesses financial data via RAG. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Yes |

### 4. `gl-line-mapper`

| Field | Value |
|-------|-------|
| **Purpose** | Map GL account codes to descriptions, categories, or reporting lines. Explain what a GL code represents. |
| **Inputs** | GL code(s), optional chart-of-accounts reference |
| **Outputs** | Account description, category, reporting line mapping, related accounts |
| **Risk Level** | Medium — may access chart of accounts via RAG. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Yes — retrieves chart of accounts or GL mapping documents |

### 5. `commentary-generator`

| Field | Value |
|-------|-------|
| **Purpose** | Generate management commentary or narrative for financial results. Suitable for board packs, monthly close notes, or variance explanations. |
| **Inputs** | Topic/period, data references (file names or RAG scope), tone (formal/concise), length target |
| **Outputs** | Draft commentary paragraph(s) with cited figures and sources |
| **Risk Level** | Medium — generates text based on financial data from RAG. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Yes |

### 6. `document-qa`

| Field | Value |
|-------|-------|
| **Purpose** | Answer questions about any SharePoint-hosted document the user has access to. General-purpose Q&A skill. |
| **Inputs** | Natural language question, optional document/library scope |
| **Outputs** | Answer with citations (SharePoint URLs) |
| **Risk Level** | Medium — broad RAG access within user's permissions. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Yes |

### 7. `sanity-check`

| Field | Value |
|-------|-------|
| **Purpose** | Validate figures, cross-check totals, identify potential errors in financial data. "Does this number make sense?" |
| **Inputs** | Figures to validate, context (what they represent), optional reference data scope |
| **Outputs** | Validation result (plausible/suspicious/error), explanation, suggested checks |
| **Risk Level** | Medium — may compare user-stated figures against RAG-retrieved reference data. |
| **Egress** | Internal RAG endpoint, Azure model endpoint |
| **RAG Required** | Optional — can validate pure logic without RAG, or cross-check against documents |

## Skill Configuration

Skills are gated via OpenClaw's existing tool policy system (`tools.sandbox.tools.allow` / `tools.sandbox.tools.deny`):

```jsonc
// openclaw.json — MVP skill gating
{
  "agents": {
    "defaults": {
      "skills": {
        "load": {
          "bundled": false,        // Do NOT load bundled skills (browser, github, discord, etc.)
          "managed": false,        // Do NOT load user-managed skills from ~/.openclaw/skills/
          "extraDirs": [
            "/opt/openclaw/mvp-skills/"   // Load ONLY from our curated directory
          ]
        }
      }
    }
  },
  "tools": {
    "sandbox": {
      "tools": {
        "allow": [
          "excel-formula-explain",
          "excel-table-summarize",
          "excel-variance-analysis",
          "gl-line-mapper",
          "commentary-generator",
          "document-qa",
          "sanity-check"
        ],
        "deny": ["*"]             // Deny everything not explicitly allowed
      }
    }
  }
}
```

**Important:** The `deny: ["*"]` with explicit `allow` list ensures that even if a skill is accidentally loaded, it cannot execute unless it's on the allowlist.

## Sandbox / Permission Model

### Filesystem Access

| Path | Access | Reason |
|------|--------|--------|
| `/opt/openclaw/mvp-skills/` | Read-only | Skill definitions (SKILL.md files) |
| `/opt/openclaw/config/` | Read-only | openclaw.json, .env |
| `/opt/openclaw/sessions/` | Read-write | Session state persistence |
| `/opt/openclaw/logs/` | Write-only | Structured trace logs |
| Everything else | Denied | No access to host filesystem, user home, or temp directories |

### Network Egress Allowlist

| Destination | Purpose | Protocol |
|-------------|---------|----------|
| `<internal-azure-endpoint>` (specific hostname) | Model completions | HTTPS |
| `<internal-rag-endpoint>` (specific hostname) | RAG search | HTTPS |
| `login.microsoftonline.com` | Azure AD token exchange (OBO flow) | HTTPS |
| `smba.trafficmanager.net` / Bot Framework endpoints | Teams message delivery | HTTPS |
| **All other destinations** | **BLOCKED** | — |

Enforcement layers:
1. **Container network policy** (e.g., Kubernetes NetworkPolicy or Docker network rules) — primary enforcement.
2. **OpenClaw SSRF guard** (`fetchWithSsrFGuard` in `src/infra/net/ssrf.ts`) — application-level backup. Private network ranges already blocked by default.
3. **Firewall rules** — defense in depth at the network infrastructure level.

### Secrets Handling

| Secret | Storage | Access |
|--------|---------|--------|
| Azure model API key | Environment variable (`AZURE_OPENAI_API_KEY`) | Read by OpenClaw provider config only |
| Bot Framework `appPassword` | Environment variable (`MSTEAMS_APP_PASSWORD`) | Read by `msteams` extension only |
| Azure AD client secret (for OBO) | Environment variable (`AAD_CLIENT_SECRET`) | Read by auth module only |
| User delegated tokens | In-memory session cache | Never written to disk; TTL-based expiry |

**No secrets in skill definitions.** Skills are plain Markdown files with behavioral instructions. They do not have access to environment variables or credentials directly — they invoke tools that the agent runtime provides, and those tools handle authentication internally.

## Skill Risk Matrix

| Skill | Data Access | RAG | Model | Can Generate PII? | Mitigation |
|-------|-------------|-----|-------|-------------------|------------|
| `excel-formula-explain` | None | No | Yes | No | Low risk — stateless |
| `excel-table-summarize` | Via RAG (user-scoped) | Yes | Yes | Yes (financial data) | Security trimming; citations required |
| `excel-variance-analysis` | Via RAG (user-scoped) | Yes | Yes | Yes (financial data) | Security trimming; citations required |
| `gl-line-mapper` | Via RAG (user-scoped) | Yes | Yes | Low | Security trimming |
| `commentary-generator` | Via RAG (user-scoped) | Yes | Yes | Yes (financial data) | Security trimming; draft watermark |
| `document-qa` | Via RAG (user-scoped) | Yes | Yes | Yes (any doc content) | Security trimming; citations required |
| `sanity-check` | Optional RAG | Maybe | Yes | Low | Stateless validation mode is zero-risk |

## Adding Skills Post-MVP

New skills must go through:

1. **Security review** — egress destinations, data access patterns, risk assessment.
2. **Allowlist update** — add to `tools.sandbox.tools.allow` in config.
3. **Egress review** — any new external destination requires firewall rule update and architecture review.
4. **Testing** — skill must be tested with the security trimming contract (user A cannot access user B's documents through the skill).
