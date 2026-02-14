# MVP Implementation Tasks

Self-contained task files for a coding agent to execute the Azure-routed OpenClaw MVP. Each task produces specific files and can be executed independently (respecting the dependency order below).

## Execution Order

```
T1 ─→ T2 ─→ T4 ─→ T6
 │           ↑
 └──→ T3 ───┘

T5 (independent — can run anytime)
```

| Task | Description | Creates | Depends On |
|------|-------------|---------|------------|
| **T1** | Extension scaffold | `extensions/rag-internal/` shell (plugin manifest, package.json, index.ts) | — |
| **T2** | RAG types + HTTP client | `src/types.ts`, `src/client.ts` | T1 |
| **T3** | OBO auth module | `src/auth.ts` | T1 |
| **T4** | Tool + prompt + chunk formatting | `src/tool.ts`, `src/prompt.ts`, updated `index.ts` | T1, T2, T3 |
| **T5** | 7 MVP skill files | `mvp-skills/*/SKILL.md` (7 files) | — (no code deps) |
| **T6** | Config + env + Docker | `deploy/openclaw.json`, `deploy/.env.template`, `deploy/docker-compose.override.yml` | T1–T5 (references all) |

## How to Use

Give the coding agent one task file at a time. Each file contains:

- **Goal**: What the task produces
- **Prerequisites**: Which prior tasks must be done
- **Files to Create**: Exact file paths and complete code/content
- **Verification**: How to confirm the task is done correctly
- **What This Does NOT Include**: Explicit scope boundaries

## Reference Docs

The tasks inline all necessary context, but for full specifications see `docs/`:

| Doc | Relevant To |
|-----|------------|
| `docs/02-architecture.md` | T6 (full config, file manifest, code path trace) |
| `docs/03-interfaces.md` | T2 (RAG API contract, TypeScript types) |
| `docs/04-identity-and-privilege-mirroring.md` | T3 (OBO flow, auth implementation) |
| `docs/05-skills-and-sandboxing.md` | T5 (skill format, loading flow) |
| `docs/06-rag-contract.md` | T2 (chunk schema, error contract) |
| `docs/07-model-contract.md` | T4 (system prompt, chunk budgeting) |
| `docs/10-observability.md` | T4 (audit logging fields) |
