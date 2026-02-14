# T1 — Scaffold the `rag-internal` Extension

## Goal

Create the bare extension structure for `extensions/rag-internal/` that OpenClaw can discover and load. After this task, the extension registers successfully but does nothing yet — it's just the shell.

## Prerequisites

- None. This is the first task.

## Files to Create

### 1. `extensions/rag-internal/openclaw.plugin.json`

```json
{
  "id": "rag-internal",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

### 2. `extensions/rag-internal/package.json`

```json
{
  "name": "@openclaw/rag-internal",
  "version": "0.1.0",
  "description": "Internal RAG integration for Azure-routed OpenClaw MVP",
  "type": "module",
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": [
      "./index.ts"
    ]
  }
}
```

**Notes:**
- `"type": "module"` is required — OpenClaw uses ESM.
- `"openclaw": { "extensions": ["./index.ts"] }` tells the plugin loader which file to import.
- `"openclaw": "workspace:*"` in `devDependencies` gives us types from the monorepo.
- No runtime dependencies yet. `fetch` is Node 22 built-in. Dependencies for MSAL (if used) will be added in T3.

### 3. `extensions/rag-internal/index.ts`

```typescript
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
```

**Pattern reference:** This follows the exact structure of `extensions/diagnostics-otel/index.ts`.

### 4. `extensions/rag-internal/src/` (empty directory)

Create the `src/` directory. Files will be added in T2–T4.

```bash
mkdir -p extensions/rag-internal/src
```

## Verification

After creating these files:

1. The extension should be discoverable by OpenClaw's plugin loader. The plugin loader scans `extensions/*/openclaw.plugin.json` and imports the file listed in `package.json` → `openclaw.extensions`.
2. No runtime errors should occur — the `register()` function only logs a message.
3. Run `pnpm install` from the repo root to register the new workspace package (the monorepo's `pnpm-workspace.yaml` should already glob `extensions/*`).

## What This Does NOT Include

- No types (T2)
- No RAG client (T2)
- No auth module (T3)
- No tool registration (T4)
- No prompt injection (T4)

## Estimated Scope

4 files, ~40 lines of code total.
