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
