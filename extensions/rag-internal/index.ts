import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const plugin = {
  id: "rag-internal",
  name: "Internal RAG",
  description: "Internal RAG service integration with OBO auth and rag_search tool",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Tool registration will be added in T4
    api.logger.info("rag-internal extension loaded");
  },
};

export default plugin;
