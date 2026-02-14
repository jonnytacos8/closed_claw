# T5 — Create 7 MVP Skill Files

## Goal

Create the 7 `SKILL.md` files that define the MVP's finance-specific skills. These are behavioral Markdown files — they teach the agent how to handle specific request types. No executable code. After this task, the agent can select and follow skill instructions for all 7 MVP workflows.

## Prerequisites

- **T4** completed (the `rag_search` tool is registered, since skills reference it).
- However, the SKILL.md files themselves can be created at any time — they're just Markdown. This task has no hard code dependency on T1–T4.

## Background: How Skills Work

Skills are loaded by `loadWorkspaceSkillEntries()` in `src/agents/skills/workspace.ts`:

1. Scans each directory listed in `skills.load.extraDirs` (our config: `["/opt/openclaw/mvp-skills/"]`).
2. For each `<dir>/<name>/SKILL.md`, parses the YAML frontmatter.
3. Creates a `SkillEntry` with `{ skill, frontmatter, metadata, invocation }`.
4. `buildWorkspaceSkillsPrompt()` formats the skill list for the system prompt.
5. At runtime, the agent reads the selected SKILL.md and follows its instructions.

**YAML frontmatter format** (from existing skills like `skills/oracle/SKILL.md` and `skills/slack/SKILL.md`):

```yaml
---
name: <skill-name>
description: <one-line description>
metadata: { "openclaw": { "emoji": "<emoji>" } }
---
```

## Directory Structure to Create

```
mvp-skills/
├── excel-formula-explain/
│   └── SKILL.md
├── excel-table-summarize/
│   └── SKILL.md
├── excel-variance-analysis/
│   └── SKILL.md
├── gl-line-mapper/
│   └── SKILL.md
├── commentary-generator/
│   └── SKILL.md
├── document-qa/
│   └── SKILL.md
└── sanity-check/
    └── SKILL.md
```

## Files to Create

### 1. `mvp-skills/excel-formula-explain/SKILL.md`

```markdown
---
name: excel-formula-explain
description: Explain Excel formulas in plain English. Identify errors and edge cases.
metadata: { "openclaw": { "emoji": "fx" } }
---

# Excel Formula Explain

Use this skill when the user asks you to explain an Excel formula, troubleshoot a formula error, or understand what a formula does.

## How to Handle

1. Parse the formula the user provides.
2. Break it down step by step — identify each function, its arguments, and what it returns.
3. Explain in plain English what the overall formula computes.
4. Flag common pitfalls (e.g., VLOOKUP exact vs. approximate match, circular references, #N/A risks).
5. If the user provides workbook context, explain how the formula interacts with the data.

## Important

- This skill does NOT require RAG. Do not call rag_search unless the user references a specific document.
- Do NOT fabricate sample data. If you need data context to explain, ask the user.
- Cite general Excel knowledge, not internal documents.
```

### 2. `mvp-skills/excel-table-summarize/SKILL.md`

```markdown
---
name: excel-table-summarize
description: Summarize tables and datasets from SharePoint-hosted Excel files. Identify trends and key figures.
metadata: { "openclaw": { "emoji": "table" } }
---

# Excel Table Summarize

Use this skill when the user asks you to summarize data from a spreadsheet, identify trends, or highlight key figures from an Excel file.

## How to Handle

1. Call `rag_search` with the user's query to retrieve relevant table chunks from SharePoint.
   - If the user names a specific file, include it in the query.
   - If the user names a library, pass it as `libraries` filter.
2. Review the returned chunks. Pay attention to `metadata.sheet_name` and `metadata.cell_range`.
3. Summarize the data: key totals, trends, outliers, top/bottom items.
4. Present summary with a Markdown table if appropriate.
5. ALWAYS cite every figure using the citation markers [1], [2], etc.

## Important

- If RAG returns no results, tell the user you couldn't find the file and suggest they check the SharePoint library name.
- If multiple sheets are relevant, summarize each and note which sheet the data comes from.
- Do NOT fabricate numbers. Every figure must come from a RAG chunk.
```

### 3. `mvp-skills/excel-variance-analysis/SKILL.md`

```markdown
---
name: excel-variance-analysis
description: Compare budget vs. actual figures. Identify and explain material variances.
metadata: { "openclaw": { "emoji": "delta" } }
---

# Excel Variance Analysis

Use this skill when the user asks about variances between budget and actual, plan vs. forecast, or any two-period comparison.

## How to Handle

1. Call `rag_search` to retrieve both budget/plan AND actual/forecast data.
   - You may need two queries: one for budget data, one for actuals.
   - Scope to the user's specified period, region, or line items.
2. For each line item where both budget and actual are available:
   - Calculate variance ($ and %).
   - Flag if it exceeds any materiality threshold the user specified (default: >5% or >$50K).
3. Present results as a Markdown table: | Line Item | Budget | Actual | Variance ($) | Variance (%) |
4. After the table, provide a narrative explaining the material variances.
5. Cite BOTH source documents for every figure.

## Important

- If you can only find one side (budget but no actuals, or vice versa), tell the user what's missing.
- Ask the user for their materiality threshold if they haven't specified one.
- Do NOT estimate or interpolate missing data. Report only what the documents contain.
```

### 4. `mvp-skills/gl-line-mapper/SKILL.md`

```markdown
---
name: gl-line-mapper
description: Map GL account codes to descriptions, categories, and reporting lines.
metadata: { "openclaw": { "emoji": "ledger" } }
---

# GL Line Mapper

Use this skill when the user asks about GL account codes, chart of accounts mappings, or reporting line classifications.

## How to Handle

1. Call `rag_search` with the GL code(s) the user provides.
   - Include "chart of accounts" or "GL mapping" in the query to target reference documents.
   - If the user mentions a specific chart of accounts document, include that in the query.
2. For each GL code, provide:
   - Account description
   - Category (e.g., Revenue, COGS, OpEx, CapEx)
   - Reporting line or financial statement line item
   - Related accounts if visible in the mapping
3. Present as a table if multiple codes are requested.
4. Cite the chart of accounts document.

## Important

- GL mappings change over time. Always cite the specific document so the user can verify it's current.
- If a code is not found, say so explicitly rather than guessing.
```

### 5. `mvp-skills/commentary-generator/SKILL.md`

```markdown
---
name: commentary-generator
description: Generate management commentary for financial results. Board packs, close notes, variance explanations.
metadata: { "openclaw": { "emoji": "pen" } }
---

# Commentary Generator

Use this skill when the user asks you to draft commentary, narrative, or explanatory text for financial results.

## How to Handle

1. Call `rag_search` to retrieve the relevant financial data for the period/topic.
   - Query for the specific period (e.g., "October 2025 close"), region, or metric.
2. Draft commentary in a professional, concise tone suitable for a board pack or monthly close report.
3. Structure:
   - Opening summary sentence (1-2 sentences covering the headline result).
   - Key highlights (3-5 bullet points with the most important figures).
   - Detailed narrative organized by topic area (revenue, costs, margins, etc.).
4. Every figure MUST be cited with the citation markers [1], [2], etc.
5. Use past tense for completed periods. Use present tense for current state.
6. Format currency consistently: $X.XM or $X,XXX with 2 decimal places.

## Important

- This generates a DRAFT. Always note: "This is a draft for review. Please verify all figures against source documents before publishing."
- Do NOT add opinions, recommendations, or forward-looking statements unless the user explicitly asks.
- If key data is missing from the RAG results, note the gap rather than fabricating.
```

### 6. `mvp-skills/document-qa/SKILL.md`

```markdown
---
name: document-qa
description: Answer questions about SharePoint-hosted documents. General-purpose document Q&A.
metadata: { "openclaw": { "emoji": "doc" } }
---

# Document Q&A

Use this skill for general questions about any document the user has access to in SharePoint. This is the fallback skill when no more specific skill applies.

## How to Handle

1. Call `rag_search` with the user's question as the query.
   - If the user mentions a specific document or library, pass it in filters.
   - If the query is broad, start with max_results: 10 and refine if needed.
2. Review the returned chunks for relevance.
3. Answer the user's question based on the document content.
4. Cite every factual claim with the citation markers [1], [2], etc.
5. If the context is insufficient, say: "I don't have enough information in the available documents to fully answer this. You may want to check the relevant SharePoint library directly."

## Important

- Do NOT answer from general knowledge if the question is about internal documents or company-specific data.
- If the user's question is about a general topic (not document-specific), you may use general knowledge but clearly state you are not citing internal documents.
- Distinguish between "no relevant documents found" and "documents found but they don't answer the question."
```

### 7. `mvp-skills/sanity-check/SKILL.md`

```markdown
---
name: sanity-check
description: Validate figures, cross-check totals, identify potential errors in financial data.
metadata: { "openclaw": { "emoji": "check" } }
---

# Sanity Check

Use this skill when the user asks you to validate a number, cross-check a total, or verify that figures "make sense."

## How to Handle

1. Understand what the user wants validated: a specific figure, a total, a trend, a ratio.
2. If the user provides the figure directly (e.g., "NA revenue is $14.2M for October"):
   - Call `rag_search` to find historical or reference data for comparison.
   - Compare the stated figure against the retrieved context.
3. If the user asks you to check figures in a document:
   - Call `rag_search` to retrieve the relevant document.
   - Verify internal consistency (do line items sum to totals? do percentages add up?).
4. Report your finding:
   - "Plausible" — the figure is consistent with available reference data. Cite the reference.
   - "Suspicious" — the figure deviates significantly from reference data. Explain why and cite sources.
   - "Cannot verify" — insufficient reference data to validate. Suggest what data would be needed.

## Important

- Be explicit about your confidence level and what you're comparing against.
- Never say a figure is "correct" — say it is "consistent with" or "plausible based on."
- Always cite the reference data used for comparison.
```

## Verification

1. Each SKILL.md has valid YAML frontmatter with `name`, `description`, and `metadata` fields.
2. The directory structure matches: `mvp-skills/<skill-name>/SKILL.md`.
3. `loadWorkspaceSkillEntries()` in `src/agents/skills/workspace.ts` can parse all 7 files when `extraDirs` includes the mvp-skills path.
4. Skills that use RAG reference `rag_search` by name (matching the tool registered in T4).
5. The `excel-formula-explain` skill explicitly notes it does NOT use RAG by default.

## What This Does NOT Include

- Config that points `skills.load.extraDirs` to this directory (T6)
- Config that blocks all bundled skills (T6)

## Estimated Scope

7 files, ~300 lines of Markdown total.
