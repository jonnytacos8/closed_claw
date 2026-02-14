import type { OpenClawPluginService } from "openclaw/plugin-sdk";

export function createRagInternalService(): OpenClawPluginService {
  return {
    id: "rag-internal",
    async start() {
      // Intentionally minimal for MVP. Tool registration happens in index.ts.
    },
  };
}
