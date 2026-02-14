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
   - If the user names a library, pass it as `filters.libraries`.
2. Review the returned chunks. Pay attention to `metadata.sheet_name` and `metadata.cell_range`.
3. Summarize the data: key totals, trends, outliers, top/bottom items.
4. Present summary with a Markdown table if appropriate.
5. ALWAYS cite every figure: `[Document Title — Sheet: SheetName](document_url)`.

## Important

- If RAG returns no results, tell the user you couldn't find the file and suggest they check the SharePoint library name.
- If multiple sheets are relevant, summarize each and note which sheet the data comes from.
- Do NOT fabricate numbers. Every figure must come from a RAG chunk.
