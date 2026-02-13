# 00 — MVP Goals: Azure-Routed OpenClaw for Finance/Ops

## Why Now

Finance and operations teams are uploading sensitive Excel models, GL extracts, and variance reports to external public LLMs (Claude, ChatGPT) to get summaries, commentary, and sanity checks. This creates three immediate risks:

1. **Data egress to uncontrolled endpoints.** Confidential financial data leaves our network boundary every time someone pastes a P&L into Claude.
2. **No audit trail.** There is no record of what was asked, what was returned, or what data was exposed.
3. **No privilege enforcement.** Anyone with a personal LLM subscription can summarize documents they should not have access to if a colleague shares them out-of-band.

OpenClaw already runs as a multi-channel assistant with a skills framework, memory/RAG subsystem, and configurable model providers. The provider system (`models.providers[name].baseUrl`) supports arbitrary endpoints with custom auth headers — which means we can route all model calls to our internal Azure OpenAI deployment without modifying core engine code.

**The opportunity:** Ship a locked-down OpenClaw instance in 2–4 weeks that gives finance/ops users a better experience than "upload to Claude" while keeping all data inside our network boundary.

## What Success Looks Like (2–4 Week Horizon)

| Metric | Target | How We Measure |
|--------|--------|----------------|
| External upload displacement | ≥40% reduction in self-reported external LLM usage among pilot group | Pre/post survey + observability on internal request volume |
| Request handling without external tools | ≥80% of pilot user requests completed end-to-end inside OpenClaw | Trace logs: completed vs. abandoned sessions |
| Time saved per Excel workflow | ≥15 min/day per active user on variance analysis, commentary, GL mapping | User diary study + session duration telemetry |
| Adoption | ≥60% weekly active usage among pilot group (20–30 users) | Unique `hashed_user_id` per week in trace logs |
| Privilege violations | 0 | RAG audit log: zero results returned where user lacked SharePoint access |
| Data egress incidents | 0 non-approved destinations | Network egress logs from OpenClaw container |
| p95 response latency | ≤8s for single-turn Excel Q&A | Trace `latency_ms` percentiles |

## Success Definition

The MVP succeeds if, at the end of a 4-week pilot:

1. The pilot group demonstrably reduces external LLM uploads for Excel-centric work.
2. Zero data egress events to unapproved endpoints are observed.
3. Users rate the tool as "useful enough to keep using" (≥4/5 on a 5-point scale) for at least 3 of the 5 core Excel workflows (variance analysis, GL mapping, model summarization, commentary generation, sanity checks).
4. No privilege-mirroring failures occur — every RAG result respects SharePoint ACLs.

## Assumptions

- **[A1]** Internal Azure OpenAI endpoint is provisioned and supports `openai-completions` or `openai-responses` API with ≥128k context window.
- **[A2]** Internal RAG service is operational, indexes target SharePoint libraries, and enforces user-level security trimming via delegated auth tokens.
- **[A3]** Teams bot registration and webhook infrastructure are available (OpenClaw already has an `msteams` extension with Bot Framework support).
- **[A4]** Pilot group of 20–30 finance/ops users can be identified and onboarded within week 1.
- **[A5]** OpenClaw can be deployed as a Docker container in our internal environment (Dockerfile and compose config exist).
