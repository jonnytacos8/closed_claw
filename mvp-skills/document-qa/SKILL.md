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
4. Cite every factual claim with `[Document Title](document_url)`.
5. If the context is insufficient, say: "I don't have enough information in the available documents to fully answer this. You may want to check [document/library] directly."

## Important

- Do NOT answer from general knowledge if the question is about internal documents or company-specific data.
- If the user's question is about a general topic (not document-specific), you may use general knowledge but clearly state you are not citing internal documents.
- Distinguish between "no relevant documents found" and "documents found but they don't answer the question."
