import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createRagInternalService } from "./src/service.js";
import { createRagSearchTool } from "./src/tool.js";

const plugin = {
  id: "rag-internal",
  name: "RAG Internal",
  description: "Internal delegated-auth RAG search tool for SharePoint-grounded finance workflows",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerService(createRagInternalService());
    api.registerTool(createRagSearchTool(), { name: "rag_search" });
  },
};

export default plugin;
