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
