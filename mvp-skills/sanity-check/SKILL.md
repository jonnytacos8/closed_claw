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
