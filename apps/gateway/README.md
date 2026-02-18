# Ashfox Gateway App

This app is the gateway multi-backend shell.

Current scope:
- Runs on NestJS + Fastify and serves MCP (`/mcp`) plus dashboard APIs (`/api/*`) on one port.
- Serves built web UI (`apps/web/dist`) as static SPA when enabled.
- Serves dashboard HTTP API/SSE endpoints on the same port under `/api`.
- Routes tool calls through a backend registry (`engine` or `blockbench`).
- Serializes mutating calls per project via `ProjectLockManager`.

Gateway structure:
- `src/gateway/gateway-runtime.service.ts`: runtime facade + shared shutdown/log helpers
- `src/gateway/gateway-config.module.ts`, `src/gateway/gateway-config.service.ts`: typed config provider
- `src/gateway/gateway-persistence.module.ts`, `src/gateway/gateway-persistence.service.ts`: Nest-managed persistence providers + lifecycle
- `src/gateway/gateway.providers.ts`, `src/gateway/tokens.ts`: explicit provider tokens/factories (registry, dispatcher, router, metrics, store)
- `packages/gateway-persistence/src/*`: shared persistence adapters/factory used by gateway and worker
- `src/gateway/controllers/dashboard.controller.ts`: dashboard API controller (`/api/*`)
- `src/gateway/controllers/mcp.controller.ts`: MCP transport controller (`/mcp`)
- `src/gateway/controllers/metrics.controller.ts`: metrics controller (`/metrics`)
- `src/gateway/core/gateway-dispatcher.ts`: backend dispatch core used by MCP executor
- `src/gateway/dto/*.dto.ts`: query/body DTO validation (`class-validator`)
- `src/gateway/pipes/project-id.pipe.ts`: project id normalization/validation
- `src/gateway/filters/gateway-exception.filter.ts`: unified API/MCP error shaping
- `src/gateway/gateway-dashboard.service.ts`: dashboard application service
- `src/gateway/gateway-mcp.service.ts`: MCP application service
- `src/gateway/gateway-metrics.service.ts`: metrics serializer
- `src/gateway/planWriter.ts`: shared `ResponsePlan` -> Fastify response writer (JSON/SSE/binary/empty)
- `src/gateway/env.ts`, `src/gateway/constants.ts`, `src/gateway/requestAdapter.ts`: config/env and HTTP adapter utilities

Dashboard API endpoints:
- `GET /api/health`
- `GET /api/projects`
- `GET /api/projects/:projectId/jobs`
- `POST /api/projects/:projectId/jobs`
- `GET /api/projects/:projectId/stream` (SSE)
- `GET /api/projects/:projectId/preview`

Environment variables:
- `ASHFOX_HOST` (default `127.0.0.1`)
- `ASHFOX_PORT` (default `8787`)
- `ASHFOX_PATH` (default `/mcp`)
- `ASHFOX_GATEWAY_BACKEND` (`engine` | `blockbench`, default `engine`)
- `ASHFOX_GATEWAY_SERVE_WEB_UI` (default `true`; when enabled, gateway serves SPA routes/static assets)
- `ASHFOX_WEB_DIST_PATH` (optional; custom static web dist path for gateway hosting)
- `ASHFOX_PERSISTENCE_FAIL_FAST` (default `true`; if `false`, start even when persistence readiness is degraded)
- `ASHFOX_PERSISTENCE_PRESET` (`local` | `selfhost` | `ashfox` | `appwrite`, default `local`)
- `ASHFOX_DB_SQLITE_PATH` (default `.ashfox/local/ashfox.sqlite`) when `ASHFOX_PERSISTENCE_PRESET=local`
- `ASHFOX_DB_SQLITE_TABLE` (default `ashfox_projects`)
- `ASHFOX_DB_SQLITE_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_STORAGE_DB_SQLITE_PATH` (default follows `ASHFOX_DB_SQLITE_PATH`) when `ASHFOX_PERSISTENCE_PRESET=local`
- `ASHFOX_STORAGE_DB_SQLITE_TABLE` (default `ashfox_blobs`)
- `ASHFOX_DB_POSTGRES_URL` (default `postgresql://ashfox:ashfox@postgres:5432/ashfox`) when `ASHFOX_PERSISTENCE_PRESET=selfhost`
- `ASHFOX_DB_POSTGRES_SCHEMA` / `ASHFOX_DB_POSTGRES_TABLE` (default `public` / `ashfox_projects`)
- `ASHFOX_DB_POSTGRES_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_STORAGE_DB_POSTGRES_URL` (default follows `ASHFOX_DB_POSTGRES_URL`) when `ASHFOX_PERSISTENCE_PRESET=selfhost`
- `ASHFOX_STORAGE_DB_POSTGRES_SCHEMA` / `ASHFOX_STORAGE_DB_POSTGRES_TABLE` (default follows DB schema / `ashfox_blobs`)
- `ASHFOX_DB_ASHFOX_URL` (optional direct connection string override) when `ASHFOX_PERSISTENCE_PRESET=ashfox`
- `ASHFOX_DB_ASHFOX_HOST` (default `database.sigee.xyx`)
- `ASHFOX_DB_ASHFOX_PORT` (default `5432`)
- `ASHFOX_DB_ASHFOX_USER` / `ASHFOX_DB_ASHFOX_PASSWORD` / `ASHFOX_DB_ASHFOX_NAME` (default `postgres` / empty / `postgres`)
- `ASHFOX_DB_ASHFOX_SSL` (default `true`)
- `ASHFOX_DB_ASHFOX_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_STORAGE_DB_ASHFOX_URL` (default follows `ASHFOX_DB_ASHFOX_URL`) when `ASHFOX_PERSISTENCE_PRESET=ashfox`
- `ASHFOX_STORAGE_DB_ASHFOX_SCHEMA` / `ASHFOX_STORAGE_DB_ASHFOX_TABLE` (default follows DB schema / `ashfox_blobs`)
- `ASHFOX_STORAGE_ASHFOX_URL` (default `https://database.sigee.xyx`) when `ASHFOX_PERSISTENCE_PRESET=ashfox`
- `ASHFOX_STORAGE_ASHFOX_SERVICE_KEY` (required for `ashfox`)
- `ASHFOX_STORAGE_ASHFOX_KEY_PREFIX` (optional)
- `ASHFOX_STORAGE_ASHFOX_UPSERT` (default `true`)
- `ASHFOX_APPWRITE_URL` (default `https://cloud.appwrite.io/v1`, shared fallback)
- `ASHFOX_APPWRITE_PROJECT_ID` / `ASHFOX_APPWRITE_API_KEY` (shared fallback)
- `ASHFOX_APPWRITE_TIMEOUT_MS` (default `15000`)
- `ASHFOX_APPWRITE_RESPONSE_FORMAT` (default `1.8.0`)
- `ASHFOX_DB_APPWRITE_URL` / `ASHFOX_DB_APPWRITE_PROJECT_ID` / `ASHFOX_DB_APPWRITE_API_KEY` (required when `ASHFOX_PERSISTENCE_PRESET=appwrite` unless shared fallback is set)
- `ASHFOX_DB_APPWRITE_DATABASE_ID` / `ASHFOX_DB_APPWRITE_COLLECTION_ID` (default `ashfox` / `ashfox_projects`)
- `ASHFOX_DB_APPWRITE_TIMEOUT_MS` / `ASHFOX_DB_APPWRITE_RESPONSE_FORMAT` (optional overrides)
- `ASHFOX_STORAGE_APPWRITE_URL` / `ASHFOX_STORAGE_APPWRITE_PROJECT_ID` / `ASHFOX_STORAGE_APPWRITE_API_KEY` (required when `ASHFOX_PERSISTENCE_PRESET=appwrite` unless shared fallback is set)
- `ASHFOX_STORAGE_APPWRITE_BUCKET_ID` (default `ashfox_blobs`)
- `ASHFOX_STORAGE_APPWRITE_KEY_PREFIX` (optional)
- `ASHFOX_STORAGE_APPWRITE_UPSERT` (default `true`)
- `ASHFOX_STORAGE_APPWRITE_METADATA_DATABASE_ID` / `ASHFOX_STORAGE_APPWRITE_METADATA_COLLECTION_ID` (default `ashfox` / `ashfox_blob_metadata`)
- `ASHFOX_STORAGE_APPWRITE_TIMEOUT_MS` / `ASHFOX_STORAGE_APPWRITE_RESPONSE_FORMAT` (optional overrides)

Tool availability enforcement is driven by backend/runtime capabilities (`list_capabilities`), not a gateway guard toggle.

Appwrite schema prerequisites:
- Database collection (`ASHFOX_DB_APPWRITE_COLLECTION_ID`) attributes: `tenantId` (string), `projectId` (string), `revision` (string), `stateJson` (string), `createdAt` (string), `updatedAt` (string)
- Storage metadata collection (`ASHFOX_STORAGE_APPWRITE_METADATA_COLLECTION_ID`) attributes: `fileId` (string), `bucket` (string), `key` (string), `contentType` (string), `cacheControl` (string), `metadataJson` (string), `updatedAt` (string)
- Storage bucket (`ASHFOX_STORAGE_APPWRITE_BUCKET_ID`) must exist before writes
- Adapter uses deterministic 36-char IDs for Appwrite document/file constraints and chunk upload for files larger than 5MB

Current persistence adapter status:
- `local` preset: `sqlite` + `db` (zero-config)
- `selfhost` preset: `postgres` + `db`
- `ashfox` preset: `ashfox` managed DB + storage
- `appwrite` preset: Appwrite DB + storage

Preset sample env files:
- `deploy/env/presets/local.env.example`
- `deploy/env/presets/selfhost.env.example`
- `deploy/env/presets/ashfox.env.example`
- `deploy/env/presets/appwrite.env.example`

## Native Production Triage Baseline

Use the following quick checks during incidents:

1. Query web health (`/api/health`) and confirm:
   - `queueBackend` matches expected mode (`persistence` in production)
   - `persistencePreset` matches deployment preset (`local`/`selfhost`/`ashfox`/`appwrite`)
2. Query gateway health via MCP `list_capabilities`/backend health and confirm persistence readiness is not degraded.

Common error-code triage:

- `invalid_state`
  - Typical cause: required capability is unavailable in current backend/profile (for example no-render preview or host-dependent plugin reload) or required state/persistence is unavailable.
  - Next action: inspect backend capability/error detail, then check backend mode and persistence health.

- `unsupported_format`
  - Typical cause: requested export format/codec is unavailable for current capabilities.
  - Next action: inspect available export targets/codecs from `list_capabilities`; retry with supported target (for example `gltf` or known `native_codec`).

- `io_error`
  - Typical cause: export/write path failed due filesystem/permission/runtime I/O issues.
  - Next action: verify destination path, process permissions, and host write availability; retry after environment fix.
