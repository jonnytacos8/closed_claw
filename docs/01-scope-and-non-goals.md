# 01 — Scope and Non-Goals

## MVP Scope (What We Will Ship)

### Core Infrastructure
- **Azure-only model routing.** Configure `models.providers` with a single provider pointing `baseUrl` at our internal Azure OpenAI endpoint. Remove or disable all other provider configurations. Auth via `api-key` or `oauth` against the Azure endpoint.
- **Internal RAG integration.** Replace or supplement OpenClaw's built-in memory search with calls to our internal RAG service that indexes SharePoint. Pass user identity tokens for security-trimmed results.
- **Egress lockdown.** Configure network policy so OpenClaw can only reach: (a) the internal Azure model endpoint, (b) the internal RAG endpoint, (c) Teams Bot Framework webhook endpoints. All other outbound traffic is blocked at the container/network level.
- **Teams as primary interface.** Use the existing `msteams` extension (`extensions/msteams/`) with Bot Framework auth. Users interact via Teams DMs or a dedicated channel.

### Skills (MVP Allowlist)
- **5–8 allowlisted skills** focused on Excel/finance workflows. No external-facing skills (no `browser`, no `github`, no `discord`, etc.).
- Skills limited to: Excel formula explanation, table summarization, variance analysis, GL line mapping, commentary generation, document Q&A, citation formatting.
- All skills restricted to internal-only egress.

### Identity & Privilege
- **User identity passthrough.** Teams SSO token → OpenClaw session → delegated token to RAG service and model endpoint.
- **Security trimming validation.** Document and test the contract: user cannot retrieve RAG results for documents they cannot access in SharePoint.

### Observability
- **Structured trace logging.** `trace_id`, `hashed_user_id`, skill invoked, document IDs retrieved, latency, token usage.
- **Minimal dashboard.** Request volume, latency percentiles, error rates, top skills used.

### Rollout
- **Pilot group of 20–30 users.** Finance/ops team members who currently use external LLMs for Excel work.
- **Training materials.** One-page quick-start guide, 3–5 example prompts for common workflows.

---

## Non-Goals (What We Will NOT Do in MVP)

| Non-Goal | Rationale |
|----------|-----------|
| Excel add-in or direct spreadsheet integration | High engineering cost; Teams interface is sufficient for MVP validation. Evaluate for Phase 2. |
| File upload processing in OpenClaw | MVP relies on SharePoint-indexed files via RAG. Users do not upload files directly to the bot. |
| Multi-model failover or model selection | Single Azure endpoint. No fallback chains, no model switching UI. |
| Custom skill development by end users | MVP ships a fixed allowlist. Skill authoring is a post-MVP capability. |
| Voice or media processing | No ElevenLabs TTS, no image generation, no video frame extraction. Text-only. |
| Multi-agent routing | Single agent instance. No per-team or per-department agent isolation. |
| Web browsing or internet search | `browser` skill and web fetch are disabled. All knowledge comes from RAG over SharePoint. |
| Mobile or desktop native apps | No macOS/iOS/Android app deployment. Teams-only for MVP. |
| Slack, Discord, WhatsApp, or other channel support | Teams is the sole channel. Other extensions are disabled. |
| DLP label enforcement in responses | We log DLP label metadata if present in RAG results, but do not block responses based on labels in MVP. Evaluate for Phase 2. |
| Fine-tuning or prompt optimization at scale | System prompts are manually curated. No automated prompt tuning pipeline. |
| Internationalization | English only for MVP. Existing i18n framework (ja-JP, zh-CN) is not exercised. |
| Canvas / A2UI rendering | The visual workspace is not exposed in MVP. Text responses only. |

---

## Scope Boundary Diagram

```
IN SCOPE                          OUT OF SCOPE
─────────────────────────────     ─────────────────────────────
Teams bot interface               Excel add-in
Azure model endpoint              Public LLM APIs
Internal RAG (SharePoint)         Direct file uploads
Security-trimmed results          DLP-based response blocking
5-8 allowlisted skills            User-authored skills
Structured trace logging          Full APM / distributed tracing
Pilot rollout (20-30 users)       Org-wide deployment
Docker container deployment       Kubernetes / auto-scaling
```
