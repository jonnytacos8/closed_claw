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
4. Every figure MUST be cited with the source document and sheet/page.
5. Use past tense for completed periods. Use present tense for current state.
6. Format currency consistently: $X.XM or $X,XXX with 2 decimal places.

## Important

- This generates a DRAFT. Always note: "This is a draft for review. Please verify all figures against source documents before publishing."
- Do NOT add opinions, recommendations, or forward-looking statements unless the user explicitly asks.
- If key data is missing from the RAG results, note the gap rather than fabricating.
