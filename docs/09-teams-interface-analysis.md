# 09 — Teams Interface Analysis

## Objective

Evaluate whether Microsoft Teams is the optimal primary interface for Excel-heavy finance/ops workflows. Propose a phased interface strategy.

## Teams as Primary Interface: Evaluation

### Strengths

| Factor | Assessment |
|--------|------------|
| **Adoption friction** | Very low. Finance/ops users already live in Teams. No new app install, no new login, no new habit. The bot appears as a chat contact. |
| **Authentication** | Built-in. Teams SSO provides Azure AD identity seamlessly. The OBO token flow for RAG security trimming is well-supported by Bot Framework. |
| **Deployment** | OpenClaw already has a production-grade `msteams` extension with Bot Framework webhook support, DM/group policies, allowlist management, and Adaptive Cards. |
| **Discoverability** | Users can find the bot in Teams search, pin it, or have it deployed to a team channel by admin. |
| **Conversation context** | Multi-turn conversations are natural in chat. Users can refine queries, ask follow-ups, and build on prior context — exactly how financial analysis works. |
| **Mobile access** | Teams mobile app gives users access to the bot on the go (e.g., reviewing numbers before a meeting). |
| **Admin control** | Teams admin center provides deployment, policy, and compliance controls. IT is already familiar with managing Teams bots. |
| **Group collaboration** | Users can invoke the bot in a team channel, making the response visible to colleagues. Useful for shared analysis during monthly close. |

### Weaknesses

| Factor | Assessment | Severity for MVP |
|--------|------------|-----------------|
| **No direct Excel interaction** | Users cannot select a cell range in Excel and ask "what does this mean?" from within Excel. They must describe the data or reference the file by name. | **Medium** — mitigated by RAG (bot can find the file without the user copying it), but still more friction than an in-Excel add-in. |
| **Text-only output** | Teams chat supports Markdown tables and text, but not interactive charts, pivot-like views, or formatted Excel output. | **Low for MVP** — financial analysis responses are primarily text and tables. Charts are a Phase 2 concern. |
| **Message size limits** | Teams messages are capped at 4,000 characters (OpenClaw's `msteams` extension handles chunking). Long commentary may be split across multiple messages. | **Low** — chunking is already implemented. Users are accustomed to scrolling. |
| **No file output** | The bot cannot generate and send back an Excel file (e.g., a reformatted table). Output is text/Markdown only. | **Low for MVP** — users can copy tables from the response. File generation is a Phase 2 feature. |
| **Context switching** | Users must switch from Excel to Teams to ask a question, then switch back. This is the core friction point. | **Medium** — less friction than "open browser → go to Claude → copy-paste → get answer → go back to Excel", but more than an Excel add-in. |
| **No cell-level referencing** | User cannot say "this cell" — they must describe what they're looking at. The bot cannot see the user's current Excel view. | **Medium** — partially mitigated by RAG retrieving the right data from SharePoint. |
| **Noise in shared channels** | If the bot is in a team channel, all queries and responses are visible to everyone in the channel. | **Low** — MVP recommends DM-first. Channel mode is optional. |

### Key Risk

The primary risk with Teams as the Excel interface is **adoption ceiling**: users who do heavy Excel work may find the context-switching friction high enough that they revert to "paste into Claude" for quick one-off questions. The convenience gap is real — Teams adds ~10 seconds of friction per query compared to an in-context add-in.

**Mitigation:** The MVP's advantage is that it connects to the actual data (no copy-paste needed) and provides citations. This saves more time than the context switch costs, for most workflows.

## Alternative Interfaces Evaluated

### Option A: Excel Add-in (Office.js)

| Dimension | Assessment |
|-----------|------------|
| **UX for Excel workflows** | Excellent. User selects a range, clicks the add-in panel, asks a question. The add-in can read the active worksheet, send context to the backend, and display results in a side panel. |
| **Adoption friction** | Medium-high. Requires sideloading (or Office Store deployment), separate add-in installation, potential IT approval. Users need to learn a new panel. |
| **Engineering effort** | High. Separate codebase (TypeScript + Office.js), different auth model (Office SSO vs. Teams SSO), different deployment pipeline. |
| **Auth/identity** | Office SSO provides Azure AD tokens, but the OBO flow is different from Teams Bot Framework. Needs separate app registration. |
| **Cell-level context** | Excellent. Add-in can read `context.workbook.getSelectedRange()` and send exact cell data to the backend. |
| **Output capabilities** | Can write results back to cells, insert tables, or display in side panel. Much richer than Teams chat. |
| **Mobile** | Limited. Office add-ins have restricted mobile support (side panels not available on mobile Excel). |
| **Collaboration** | Low. Add-in is a single-user experience. No shared visibility like a Teams channel. |
| **MVP feasibility** | Not feasible for 2–4 week timeline without dedicated frontend engineering. |

### Option B: Web App

| Dimension | Assessment |
|-----------|------------|
| **UX for Excel workflows** | Medium. Chat interface in a browser tab. Better than Teams for long-form output (no message size limits), but still requires context switching from Excel. |
| **Adoption friction** | Medium. New URL to remember, new interface to learn. |
| **Engineering effort** | Medium. OpenClaw already has a WebChat UI (`ui/` directory). Could be adapted for internal deployment. |
| **Auth/identity** | Azure AD login via MSAL.js. Well-understood, but another auth flow to maintain. |
| **Cell-level context** | None. Same limitation as Teams. |
| **Output capabilities** | Better than Teams — no message size limits, could render interactive tables. |
| **Collaboration** | Low (unless we build sharing features). |
| **MVP feasibility** | Possible but adds deployment/hosting complexity with no clear advantage over Teams for the pilot. |

### Option C: Outlook Add-in

| Dimension | Assessment |
|-----------|------------|
| **UX for Excel workflows** | Poor. Outlook is not where Excel work happens. Only useful if the workflow starts from an email containing an attachment. |
| **Adoption friction** | Medium. Similar to Excel add-in — requires installation. |
| **Engineering effort** | Medium. Office.js, different manifest. |
| **Relevance** | Low for Excel-centric MVP. Could be useful post-MVP for "summarize the Excel attachment in this email." |
| **MVP feasibility** | Not a priority. |

## Recommendation: Phased Interface Strategy

### Phase 1 (MVP — Weeks 1–4): Teams DM Bot

**Primary interface:** Microsoft Teams, direct message with the bot.

**Rationale:**
- Lowest friction to deploy and adopt.
- Auth infrastructure (SSO, OBO) is well-supported by the existing `msteams` extension.
- Multi-turn conversation is natural for financial analysis workflows.
- Zero new software for users to install.
- The RAG-connected approach (no copy-paste needed) compensates for the context-switching cost.

**Configuration:**
- `dmPolicy: "allowlist"` — only pilot users can DM the bot.
- `groupPolicy: "disabled"` initially — enable for specific team channels after pilot validation.
- `textChunkLimit: 4000` — existing default.

### Phase 2 (Weeks 5–10): Excel Add-in + Teams Channel Mode

**Primary addition:** Excel add-in (Office.js) for in-context Excel workflows.

| Investment | Deliverable |
|------------|-------------|
| Excel add-in (task pane) | Side panel in Excel with chat interface. Can read selected range, send to backend, display results. |
| Teams channel mode | Enable bot in specific team channels for shared analysis during monthly close. |
| File-based Teams flow | User shares a SharePoint file link in Teams → bot summarizes it. |

**Rationale for Phase 2 timing:**
- MVP validates that the workflows and RAG integration are useful. No point building an add-in for workflows users don't value.
- Phase 1 usage data reveals which skills are most used and whether context-switching is the #1 friction point (it may not be — "finding the right file" might matter more).
- The backend (skills, RAG contract, model contract) is the same for both Teams and add-in interfaces. Phase 1 hardens the backend.

### Phase 3 (Months 3–6): Deep Integration

| Investment | Deliverable |
|------------|-------------|
| Excel add-in: write-back | Insert tables, formulas, or formatted results directly into the worksheet. |
| Web dashboard | Usage analytics, query history, saved analyses. |
| Multi-agent | Per-team agents with different library scopes and skills. |
| Outlook integration | Summarize email attachments. |

## Interface Comparison Matrix

| Criterion | Teams (MVP) | Excel Add-in (Phase 2) | Web App | Outlook |
|-----------|:-----------:|:----------------------:|:-------:|:-------:|
| Adoption friction | Very Low | Medium | Medium | Medium |
| Excel context awareness | None | High | None | None |
| Auth simplicity | High | Medium | Medium | Medium |
| Engineering effort (incremental) | Zero (exists) | High | Medium | Medium |
| Mobile support | Yes | Limited | Yes | Yes |
| Collaboration | High | None | Low | Low |
| Output richness | Medium | High | High | Medium |
| MVP-ready | Yes | No | Possible | No |
| Long-term ceiling for Excel work | Medium | Very High | Medium | Low |

## Decision

**Teams is the correct MVP interface.** It trades some Excel-context richness for dramatically lower adoption friction, zero deployment overhead, and built-in collaboration. The RAG integration compensates for lack of cell-level context by retrieving data the user would otherwise have to copy-paste.

**The Excel add-in is the correct Phase 2 investment** for users who need deeper Excel integration. Phase 1 data will validate the demand and inform add-in feature priorities.
