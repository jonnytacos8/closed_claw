# 08 — Excel Competition Plan

## Implementation Note

This doc defines the 5 core workflows the MVP must support. Each workflow maps to a skill in doc 05 and composes `rag_search` (doc 03/06) + model calls (doc 07). A coding agent validates the MVP by running these 5 workflows end-to-end and confirming citations link to real SharePoint `webUrl`s.

## The Problem We're Solving

Finance and ops teams currently "upload to Claude" (or ChatGPT) for Excel-centric work: pasting spreadsheet data into a public LLM to get variance explanations, commentary drafts, formula help, and sanity checks. This workflow is:

1. **Insecure** — confidential financial data leaves the org boundary.
2. **Uncited** — responses don't link back to source documents.
3. **Disconnected** — users manually copy-paste between Excel, SharePoint, and the LLM.
4. **Unaudited** — no record of what data was exposed or what advice was followed.

## How We Beat "Claude for Excel"

Our advantage is not that we have a better model. Our advantage is that we are **inside the network**, **connected to the data**, and **auditable**. We win by making the internal tool faster and easier than the copy-paste workflow, not by matching Claude's general capabilities.

### MVP Competitive Positioning

| "Claude for Excel" Workflow | Our MVP Equivalent | Why Ours Is Better |
|-----------------------------|-------------------|--------------------|
| Copy table from Excel → paste into Claude → ask "explain the variance" | Ask in Teams: "What drove the Q3 COGS variance?" | No copy-paste. RAG retrieves the data automatically. Response cites the source document. |
| Copy formula → paste into Claude → "what does this do?" | Ask in Teams: "Explain this formula: =INDEX(MATCH(...))" | Same convenience, but no data leaves the org. |
| Copy P&L → paste into Claude → "write board commentary" | Ask in Teams: "Draft commentary for October close" | RAG pulls the actual P&L. Commentary cites real figures from real documents. |
| Copy GL export → paste into Claude → "what is account 5210?" | Ask in Teams: "What is GL 5210?" | RAG retrieves the chart of accounts. Answer is always current. |
| Manually check column totals in Excel | Ask in Teams: "Do the department totals in the Q3 model add up to the consolidated line?" | Cross-references multiple data points via RAG. |

## Core MVP Workflows (5)

### Workflow 1: Variance Analysis

**User says:** "What are the material variances in Q3 actuals vs. budget for the NA region?"

**What happens:**
1. `excel-variance-analysis` skill is selected.
2. RAG query: budget and actual data for Q3 NA, scoped to "finance-models" library.
3. RAG returns chunks from "Q3 2025 NA Budget.xlsx" and "Q3 2025 NA Actuals.xlsx".
4. Model compares figures, identifies variances exceeding materiality threshold.
5. Response: table of variances + narrative + citations to both source files.

**Why it beats Claude:** User doesn't need to find, open, copy, and paste from two different spreadsheets. RAG does the retrieval. Citations let them click through to verify.

### Workflow 2: GL Line Mapping

**User says:** "Map these GL codes to their reporting lines: 4100, 4200, 5210, 6300."

**What happens:**
1. `gl-line-mapper` skill is selected.
2. RAG query: chart of accounts, scoped to "reference-data" library.
3. RAG returns chart of accounts chunks containing the requested GL codes.
4. Model maps each code to its description, category, and reporting line.
5. Response: mapping table + citation to chart of accounts document.

**Why it beats Claude:** The chart of accounts is always current (indexed from SharePoint). No risk of the user pasting an outdated version.

### Workflow 3: Model/Report Summarization

**User says:** "Summarize the key findings from the Q3 financial model."

**What happens:**
1. `excel-table-summarize` skill is selected.
2. RAG query: "Q3 financial model" in "finance-models" library.
3. RAG returns chunks from summary sheets, P&L, balance sheet.
4. Model synthesizes a structured summary: revenue, expenses, margins, cash flow.
5. Response: summary with figures + citations to specific sheets/ranges.

**Why it beats Claude:** No need to download the Excel file, open it, select the relevant sheets, copy them. The summary is grounded in the actual document with verifiable citations.

### Workflow 4: Commentary Generation

**User says:** "Draft the COGS section of the October board commentary."

**What happens:**
1. `commentary-generator` skill is selected.
2. RAG query: October close data, COGS-related documents.
3. RAG returns P&L chunks, COGS detail, prior period comparisons.
4. Model generates professional commentary in board-pack style.
5. Response: draft paragraphs with every figure cited.

**Why it beats Claude:** The commentary is grounded in real, current data with citations. The user can verify every number by clicking the source link. No risk of fabricated figures.

### Workflow 5: Sanity Checks

**User says:** "The NA revenue line shows $14.2M for October. Does that look right based on the monthly trend?"

**What happens:**
1. `sanity-check` skill is selected.
2. RAG query: NA revenue data, monthly trend, scoped to recent periods.
3. RAG returns revenue figures from prior months.
4. Model compares $14.2M against the trend, flags if it's an outlier.
5. Response: "October NA revenue of $14.2M is within normal range (Sep: $13.8M, Aug: $14.5M) [source]. No anomaly detected." OR flags a concern with explanation.

**Why it beats Claude:** The comparison is against actual historical data from SharePoint, not the user's memory or a manually pasted subset.

## "Cite Your Sources" Requirement

Every response that references document content **must** include a citation. This is non-negotiable for financial workflows where accuracy and auditability matter.

### Citation Rules

1. **Every factual claim** (number, date, account code, finding) must cite its source.
2. **Citation format:** `[Document Title — Sheet/Page](SharePoint URL)`.
3. **Multiple sources** are cited independently: `[1]`, `[2]`, etc.
4. **No citation = explicitly stated.** If the model answers from general knowledge (e.g., explaining what a VLOOKUP does), it must say "This is based on general Excel knowledge, not your documents."
5. **Unverifiable claims are flagged.** If the model synthesizes a conclusion not directly stated in any source, it must note: "This conclusion is inferred from [Source 1] and [Source 2] — please verify."

### Citation Integrity

Citations are **not fabricated by the model**. The flow:

1. RAG returns chunks with `document_url`.
2. OpenClaw numbers the chunks `[1]`, `[2]`, etc. in the prompt.
3. Model references chunks by number.
4. OpenClaw post-processes the response: replaces `[1]` with the actual `[Document Title](URL)` link.

This prevents the model from hallucinating citation URLs.

## Path to Spreadsheet Integration (Post-MVP)

The MVP is Teams-only. Users cannot upload files to the bot or interact with Excel directly. However, we should plan for deeper integration.

### Phase 2 Options (Evaluated, Not Implemented in MVP)

| Option | Effort | Impact | Recommendation |
|--------|--------|--------|----------------|
| **Excel Add-in (Office.js)** | High — separate codebase, Office Store or sideload deployment, different auth model | Very High — meets users exactly where they work, reduces context-switching to zero | **Phase 2 primary.** Design the add-in to call the same OpenClaw backend. |
| **Teams file-based flow** | Medium — user shares a file link in Teams, bot processes it via SharePoint API | Medium — reduces copy-paste but still requires Teams context switch | **Phase 2 secondary.** Low incremental effort if RAG already indexes the file. |
| **File upload to bot** | Medium — accept file attachments in Teams, extract content, send to model | Medium — works for ad-hoc files not in SharePoint | **Phase 2 tertiary.** Useful but breaks the "SharePoint is source of truth" model. Requires careful handling of uploaded data lifecycle. |
| **Web app with drag-and-drop** | High — separate frontend, auth, hosting | Medium — another surface to maintain | **Deprioritize.** Teams or Excel add-in covers the use case better. |

### MVP-to-Phase-2 Bridge

To prepare for the Excel add-in without building it now:

1. **Design skills to be interface-agnostic.** Skills take structured inputs (query, scope, parameters) and return structured outputs. They don't assume Teams as the delivery mechanism.
2. **Keep the RAG contract stable.** The add-in will call the same RAG endpoint.
3. **Keep the model contract stable.** The add-in will use the same prompt templates.
4. **Log skill usage patterns.** Which skills are most used, what workflows take the most turns — this data informs add-in feature prioritization.

## MVP Success Criteria (Excel-Specific)

| Metric | Target |
|--------|--------|
| Variance analysis requests handled end-to-end | ≥80% complete without user needing to paste data manually |
| Commentary generation accepted by users | ≥50% of drafts used with minor edits (vs. rewritten from scratch) |
| Citation accuracy | 100% of cited figures traceable to source documents |
| Time to first useful answer | ≤30 seconds for single-turn queries |
| User preference vs. external LLM | ≥60% of pilot users prefer internal tool for these 5 workflows |
