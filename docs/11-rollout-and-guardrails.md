# 11 — Rollout and Guardrails

## Implementation Note

The "external upload discouraged" messaging is implemented as a system prompt instruction in `extensions/rag-internal/src/prompt.ts` (see doc 07), not as a hardcoded filter. Rate limiting and conversation length limits are handled by existing OpenClaw session management in `src/sessions/`. The `allowFrom` list in `channels.msteams` config controls pilot user access.

## MVP Rollout Plan

### Phase 0: Pre-Pilot Setup (Week 0)

| Task | Owner | Detail |
|------|-------|--------|
| Deploy OpenClaw container to internal environment | Platform | Docker image with `models.mode: "replace"`, single Azure provider, network policy enforced |
| Register Teams bot | Platform | `appId`, `appPassword`, `tenantId` configured in `msteams` extension |
| Configure RAG integration | Platform + RAG team | Internal RAG endpoint URL, OBO app registration, test security trimming |
| Deploy MVP skills | Platform | 7 allowlisted skills in `/opt/openclaw/mvp-skills/` |
| Onboard SharePoint libraries | RAG team + Finance | Index target libraries (finance-models, budget-2025, chart-of-accounts, monthly-close) |
| Validate end-to-end flow | Platform + QA | Test: Teams message → skill selection → RAG query (security-trimmed) → model response → citation links work |
| Baseline survey | Product | Survey pilot group on current external LLM usage: frequency, workflows, time spent, satisfaction |

### Phase 1: Closed Pilot (Weeks 1–2)

| Parameter | Value |
|-----------|-------|
| **Pilot group size** | 20–30 users |
| **Selection criteria** | Finance/ops team members who self-report regular external LLM usage for Excel work. Mix of analysts, managers, and senior staff. |
| **Access control** | `dmPolicy: "allowlist"` with pilot users' Azure AD Object IDs in `allowFrom` |
| **Channels enabled** | DM only (no group channels) |
| **Skills enabled** | All 7 MVP skills |
| **Support** | Dedicated Slack/Teams channel for pilot feedback. Platform team monitors errors in real-time. |
| **Training** | 30-minute walkthrough session + one-page quick-start guide (see below) |

#### Quick-Start Guide Content

```
GETTING STARTED WITH [BOT NAME]

1. Find "[Bot Name]" in your Teams contacts (or search for it).
2. Send a DM — just type your question naturally.

EXAMPLE PROMPTS:
- "What drove the Q3 COGS variance vs. budget?"
- "Explain this formula: =INDEX(MATCH(...))"
- "Draft October board commentary for the revenue section"
- "What is GL account 5210?"
- "Summarize the key findings from the Q3 financial model"
- "The NA revenue line shows $14.2M for October — does that look right?"

TIPS:
- Be specific about which period, region, or document you're asking about.
- The bot searches your SharePoint documents — you don't need to copy-paste data.
- Every answer includes citations you can click to verify the source.
- Follow-up questions work! Refine your query in the same conversation.

WHAT IT CAN'T DO (YET):
- Read files you upload directly — it only searches SharePoint.
- Generate Excel files or charts.
- Access documents outside the indexed SharePoint libraries.
```

### Phase 2: Expanded Pilot (Weeks 3–4)

| Parameter | Value |
|-----------|-------|
| **Expansion criteria** | Pilot group reports ≥4/5 usefulness score AND zero security/privilege incidents |
| **Additional users** | 20–50 more (adjacent teams, other finance functions) |
| **Channels enabled** | DM + 1–2 shared team channels (e.g., "Monthly Close" channel) |
| **New libraries** | Add libraries requested by new users (via admin onboarding process) |
| **Feedback collection** | Mid-pilot survey, usage data review, 1:1 interviews with 5–10 power users |

### Phase 3: Decision Point (End of Week 4)

Based on pilot data, decide:

| Outcome | Criteria | Next Step |
|---------|----------|-----------|
| **Scale** | Meets success metrics (doc 00): ≥40% external upload reduction, ≥60% weekly active, ≥4/5 usefulness | Expand to full finance/ops org. Begin Phase 2 interface work (Excel add-in). |
| **Iterate** | Mixed results — some workflows work well, others don't | Focus on top-performing workflows. Improve underperforming skills. Extend pilot 2 more weeks. |
| **Pivot** | Poor adoption or critical issues | Investigate root cause. Consider interface change (web app), skill redesign, or scope reduction. |

## Guardrails

### Data Loss Prevention (DLP)

| Guardrail | Implementation | MVP Scope |
|-----------|---------------|-----------|
| **DLP label awareness** | RAG service includes `dlp_labels` in chunk metadata. OpenClaw logs which labels were present in retrieved documents. | Log only — no blocking based on labels in MVP |
| **No raw document serving** | OpenClaw never returns full documents. Only RAG-extracted chunks with citations. Users go to SharePoint for the full file. | Enforced by architecture |
| **No file upload processing** | Bot does not accept file uploads. All data comes from RAG-indexed SharePoint. | Enforced by skill design — no upload skill in allowlist |
| **Egress lockdown** | Container network policy blocks all outbound traffic except approved endpoints. | Enforced at network + application layer |

### "External Upload Discouraged" Messaging

When a user mentions using an external tool or asks about uploading files to external services, the bot should respond with a gentle redirect:

**Trigger phrases** (detected in user message):
- "upload to Claude"
- "paste into ChatGPT"
- "use Claude for"
- "external AI"
- "copy this to" (when followed by an external service name)

**Response:**
```
I can help with that directly — no need to use an external tool. I have access
to your SharePoint documents and can search, summarize, and analyze them securely.

Just ask me your question and I'll find the relevant data.

Note: Uploading company data to external AI tools may violate data handling policies.
```

**Implementation:** This is a system prompt instruction, not a hardcoded filter. The model is instructed to recognize these patterns and redirect.

### Response Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **Citation requirement** | System prompt mandates citations for every factual claim. Skills reinforce this. |
| **"I don't know" enforcement** | System prompt instructs the model to say "I don't have enough information" rather than guessing. |
| **No financial advice framing** | System prompt: "You provide analysis based on documents, not financial advice. Always recommend users verify critical figures and consult appropriate stakeholders." |
| **No fabrication** | System prompt: "NEVER fabricate numbers, dates, account codes, or financial figures. If a figure is not in the provided context, do not state it." |
| **Scope boundaries** | System prompt: "Only answer questions related to the user's documents and financial data. Decline unrelated requests." |

### Operational Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| **Rate limiting per user** | Max 50 requests per user per hour. Prevents runaway usage or abuse. Configurable. |
| **Conversation length limit** | Max 20 turns per conversation. Long conversations are compacted; users can start a new conversation. |
| **Token budget per request** | Max ~20,000 tokens per model call (prompt + response). Prevents cost spikes from large RAG contexts. |
| **Concurrent request limit** | Max 5 concurrent model calls across all users. Prevents Azure endpoint overload during pilot. |
| **Skill invocation limit** | Max 3 skill invocations per user turn. Prevents recursive or runaway skill chains. |

## Measuring Displacement of External Tool Usage

### Quantitative Measures

| Metric | Data Source | Frequency |
|--------|------------|-----------|
| Self-reported external LLM usage | Pre/post survey (5-point frequency scale) | Baseline (week 0), mid-pilot (week 2), end-pilot (week 4) |
| Internal bot request volume | Observability traces | Continuous (daily dashboard) |
| Unique active users per week | Observability traces (`hashed_user_id`) | Weekly |
| Requests per user per day | Observability traces | Daily |
| Session abandonment rate | Traces where user sends 1 message and never follows up | Weekly |
| Skill usage distribution | Traces by `skill.name` | Weekly |

### Qualitative Measures

| Method | Detail | Frequency |
|--------|--------|-----------|
| Weekly pulse survey | 3 questions: usefulness (1–5), frequency of external tool use (1–5), biggest friction (open text) | Weekly during pilot |
| 1:1 interviews | 30-min interviews with 5–10 users. Focus: what workflows shifted, what didn't, why. | Week 2 and week 4 |
| Feedback channel monitoring | Dedicated Teams channel for pilot feedback. Tag and categorize issues. | Continuous |

### Displacement Target

```
Baseline (Week 0):
  "How often do you use external LLMs for Excel/finance work?"
  1 = Never, 2 = Rarely, 3 = Weekly, 4 = Several times/week, 5 = Daily

Target (Week 4):
  Average score drops by ≥1.5 points AND
  Internal bot usage is ≥3 requests/user/day among active users
```

## Training Plan

| Session | Audience | Format | Duration | Content |
|---------|----------|--------|----------|---------|
| Kickoff walkthrough | All pilot users | Live Teams meeting with screen share | 30 min | Demo of 5 core workflows, Q&A, quick-start guide distribution |
| Office hours | All pilot users | Drop-in Teams meeting | 30 min/week | Open questions, troubleshooting, feature requests |
| Power user deep-dive | Self-selected | Small group (5–8) | 45 min | Advanced prompting techniques, multi-turn workflows, library scoping |
| Feedback retrospective | All pilot users | Live Teams meeting | 30 min | Week 4 — review results, gather input for Phase 2 priorities |
