// === RAG Request ===
export type RagSearchRequest = {
  query: string;
  filters?: {
    libraries?: string[];
    file_types?: string[];
    modified_after?: string; // ISO 8601
  };
  max_results?: number; // default 10, max 25
  min_score?: number; // default 0.3
  include_citations?: boolean; // default true
  user_context: {
    upn: string; // must match delegated token's upn claim
  };
};

// === RAG Response ===
export type RagSearchResponse = {
  results: RagChunk[];
  total_matches: number;
  query_id: string; // correlation ID for RAG-side audit
  truncated: boolean;
};

export type RagChunk = {
  chunk_id: string;
  document_id: string; // SharePoint item ID
  document_title: string;
  document_url: string; // SharePoint webUrl — REQUIRED for citations
  library: string;
  chunk_text: string; // max ~2000 chars
  chunk_index: number;
  total_chunks: number;
  relevance_score: number; // 0.0–1.0
  metadata: RagChunkMetadata;
};

export type RagChunkMetadata = {
  file_type: string; // .xlsx, .csv, .docx, .pdf, .pptx
  sheet_name?: string | null;
  cell_range?: string | null;
  page_number?: number | null;
  section_heading?: string | null;
  last_modified: string; // ISO 8601
  last_modified_by?: string;
  dlp_labels?: string[];
  content_type?: "table" | "text" | "formula" | "mixed";
};
