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
