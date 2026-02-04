# bbmcp Release Gate v1

This document defines the bbmcp release bar. A change is deployable only if it passes all MUST gates below.

## One Command
- Local / CI gate: `npm run quality`

## MUST Gates (CI hard fail)

### Gate A: Type Safety
- `npm run typecheck`
- Threshold: TypeScript errors = 0

### Gate B: Tests + Coverage (including contracts)
- `npm run test:cov` (runs `npm test` under c8)
- Threshold: exit code 0
- Contracts are enforced via tests (examples):
  - Tool registry hash/count is stable unless intentionally changed.
  - ToolResponse -> MCP call result formatting stays stable.

### Gate C: Build
- `npm run build`
- Threshold: exit code 0
- Output bundles must be produced (esbuild):
  - `dist/bbmcp.js`, `dist/bbmcp.js.map`
  - `dist/bbmcp-sidecar.js`, `dist/bbmcp-sidecar.js.map`

### Gate D: Static Quality Checks
- `npm run quality:check`
- Threshold: 0 violations

Rules enforced by the script:
- `@ts-ignore`, `@ts-expect-error`
- `as any`
- `as unknown as`
- `console.*` in `src/**` (allowed only in `src/logging.ts`)
- bare `document` / `window` identifier access
- `throw` in `src/**` except the Blockbench codec compile guard in `src/plugin/runtime.ts`
- TODO/FIXME comments in `src/**`
- `catch {}` without binding in `src/**`
- `globalThis as` casts in `src/**` (allowed only in `src/types/blockbench.ts` and `src/services/globalState.ts`)

### Gate E: Version Consistency
- `package.json#version` must match `src/config.ts#PLUGIN_VERSION`.

### Gate F: Dependency Vulnerabilities
- `npm run quality:audit`
- Threshold: `npm audit --omit=dev --audit-level=high` returns exit code 0.

### Gate G: Coverage Regression (baseline)
- `npm run test:cov` must generate `coverage/coverage-summary.json`.
- `npm run quality:coverage` compares totals against `docs/coverage-baseline.json`.
- Threshold:
  - no regression vs baseline (lines/statements/functions/branches)
  - AND must meet absolute floors (release bar)

Current absolute floors (v1):
- lines >= 65%
- statements >= 65%
- functions >= 42%
- branches >= 50%

Ratchet policy (strict):
- Floors only move up.
- Increase floors by 1-2 percentage points periodically (e.g., every 2 weeks) or when adding a new feature area.

Baseline update (intentional only):
```
npm run test:cov
node scripts/quality/coverage.js --update-baseline
```

## Changing Tool Surface
If MCP tool schemas/tool registry change intentionally:
- Update `TOOL_SCHEMA_VERSION` in `src/config.ts`.
- Update the tool registry contract test (`scripts/tests/toolRegistry.test.ts`) with the new hash.
- Update docs/examples for the changed tool(s).

## Notes
- The goal is strictness with low operational burden.
- Prefer small, mechanical refactors that reduce footguns (throw in Undo blocks, console spam, unsafe globals).
