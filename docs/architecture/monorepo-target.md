# Ashfox Monorepo Target (Incremental)

This document defines the target structure while preserving current behavior.

## Current Executable Boundaries

- Plugin bundle entry: `apps/plugin-desktop/src/index.ts`
- Headless/sidecar entry: `apps/mcp-headless/src/index.ts`
- Contract source of truth: `packages/contracts/src/mcpSchemas/*`
  - Version/hash policy: `packages/contracts/src/mcpSchemas/policy.ts`
- Conformance checks: `packages/conformance/tests/*`
- Shared implementation: `src/`
- Docs app: `apps/docs/`

## Target Layout

```text
apps/
  plugin-desktop/      # Blockbench plugin runtime shell
  mcp-headless/        # UI-less MCP runtime shell
  docs/                # User-facing documentation site
packages/
  contracts/           # MCP tool schemas + contract types (implemented for mcpSchemas)
  conformance/         # Protocol/tool conformance tests
src/
  ...                  # Existing implementation (migration source)
```

## Migration Rules

1. Runtime compatibility first.
2. Move boundaries before internals.
3. Keep a single source of truth for schemas.
4. Treat `toolSchemaVersion` as coarse and `toolRegistry.hash` as the authoritative schema-change signal.
5. Add conformance tests before changing protocol behavior.

## Next Refactor Steps

1. Extract remaining contract-adjacent types from `src/types/*` into `packages/contracts`.
2. Expand `packages/conformance` coverage to include protocol session/resource invariants.
3. Add package-level typecheck/lint commands and enforce them in CI.
4. Continue narrowing `src/` into runtime/adapters only.
