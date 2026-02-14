export type RagSearchRequest = {
  query: string;
  filters?: {
    libraries?: string[];
    file_types?: string[];
    modified_after?: string;
  };
  max_results?: number;
  include_citations?: boolean;
  min_score?: number;
  user_context: {
    upn: string;
  };
};

export type RagSearchResponse = {
  results: RagChunk[];
  total_matches: number;
  query_id: string;
  truncated: boolean;
};

export type RagChunk = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_url: string;
  library: string;
  chunk_text: string;
  chunk_index: number;
  total_chunks: number;
  relevance_score: number;
  metadata: RagChunkMetadata;
};

export type RagChunkMetadata = {
  file_type: string;
  sheet_name?: string | null;
  cell_range?: string | null;
  page_number?: number | null;
  section_heading?: string | null;
  last_modified: string;
  last_modified_by?: string;
  dlp_labels?: string[];
  content_type?: "table" | "text" | "formula" | "mixed";
};
