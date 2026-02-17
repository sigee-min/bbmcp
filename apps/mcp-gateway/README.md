# Ashfox MCP Gateway App

This app is the multi-backend MCP gateway shell.

Current scope:
- Starts an MCP endpoint using `@ashfox/runtime` transport/server.
- Routes tool calls through a backend registry (`engine` or `blockbench`).
- Serializes mutating calls per project via `ProjectLockManager`.

Environment variables:
- `ASHFOX_HOST` (default `127.0.0.1`)
- `ASHFOX_PORT` (default `8787`)
- `ASHFOX_PATH` (default `/mcp`)
- `ASHFOX_GATEWAY_BACKEND` (`engine` | `blockbench`, default `engine`)
- `ASHFOX_PERSISTENCE_FAIL_FAST` (default `true`; if `false`, start even when persistence readiness is degraded)
- `ASHFOX_PERSISTENCE_PRESET` (`local` | `selfhost` | `ashfox` | `appwrite`, default `local`)
- `ASHFOX_DB_PROVIDER` (`sqlite` | `postgres` | `ashfox` | `appwrite`) overrides preset DB selection
- `ASHFOX_STORAGE_PROVIDER` (`fs` | `s3` | `ashfox` | `appwrite`) overrides preset storage selection
- `ASHFOX_STORAGE_FS_ROOT` (default `.ashfox/storage`) when `ASHFOX_STORAGE_PROVIDER=fs`
- `ASHFOX_DB_SQLITE_PATH` (default `.ashfox/local/ashfox.sqlite`) when `ASHFOX_DB_PROVIDER=sqlite`
- `ASHFOX_DB_SQLITE_TABLE` (default `ashfox_projects`)
- `ASHFOX_DB_SQLITE_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_DB_POSTGRES_URL` (default `postgresql://ashfox:ashfox@postgres:5432/ashfox`)
- `ASHFOX_DB_POSTGRES_SCHEMA` / `ASHFOX_DB_POSTGRES_TABLE` (default `public` / `ashfox_projects`)
- `ASHFOX_DB_POSTGRES_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_DB_ASHFOX_URL` (optional direct connection string override)
- `ASHFOX_DB_ASHFOX_HOST` (default `database.sigee.xyx`)
- `ASHFOX_DB_ASHFOX_PORT` (default `5432`)
- `ASHFOX_DB_ASHFOX_USER` / `ASHFOX_DB_ASHFOX_PASSWORD` / `ASHFOX_DB_ASHFOX_NAME` (default `postgres` / empty / `postgres`)
- `ASHFOX_DB_ASHFOX_SSL` (default `true`)
- `ASHFOX_DB_ASHFOX_MIGRATIONS_TABLE` (default `ashfox_schema_migrations`)
- `ASHFOX_STORAGE_S3_REGION` (default `us-east-1`)
- `ASHFOX_STORAGE_S3_ENDPOINT` (optional, for self-host/minio)
- `ASHFOX_STORAGE_S3_ACCESS_KEY_ID` / `ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY` (required for `s3`)
- `ASHFOX_STORAGE_S3_SESSION_TOKEN` (optional)
- `ASHFOX_STORAGE_S3_FORCE_PATH_STYLE` (default `true`)
- `ASHFOX_STORAGE_S3_KEY_PREFIX` (optional)
- `ASHFOX_STORAGE_ASHFOX_URL` (default `https://database.sigee.xyx`)
- `ASHFOX_STORAGE_ASHFOX_SERVICE_KEY` (required for `ashfox`)
- `ASHFOX_STORAGE_ASHFOX_KEY_PREFIX` (optional)
- `ASHFOX_STORAGE_ASHFOX_UPSERT` (default `true`)
- `ASHFOX_APPWRITE_URL` (default `https://cloud.appwrite.io/v1`, shared fallback)
- `ASHFOX_APPWRITE_PROJECT_ID` / `ASHFOX_APPWRITE_API_KEY` (shared fallback)
- `ASHFOX_APPWRITE_TIMEOUT_MS` (default `15000`)
- `ASHFOX_APPWRITE_RESPONSE_FORMAT` (default `1.8.0`)
- `ASHFOX_DB_APPWRITE_URL` / `ASHFOX_DB_APPWRITE_PROJECT_ID` / `ASHFOX_DB_APPWRITE_API_KEY` (required for `appwrite` DB unless shared fallback is set)
- `ASHFOX_DB_APPWRITE_DATABASE_ID` / `ASHFOX_DB_APPWRITE_COLLECTION_ID` (default `ashfox` / `ashfox_projects`)
- `ASHFOX_DB_APPWRITE_TIMEOUT_MS` / `ASHFOX_DB_APPWRITE_RESPONSE_FORMAT` (optional overrides)
- `ASHFOX_STORAGE_APPWRITE_URL` / `ASHFOX_STORAGE_APPWRITE_PROJECT_ID` / `ASHFOX_STORAGE_APPWRITE_API_KEY` (required for `appwrite` storage unless shared fallback is set)
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
- `local` preset: `sqlite` + `fs` (zero-config)
- `postgres`: implemented (`pg`)
- `ashfox` managed DB: implemented (`pg`, default host `database.sigee.xyx`)
- `appwrite` database: implemented (Databases API)
- `fs` storage: implemented
- `s3` storage: implemented (`@aws-sdk/client-s3`)
- `ashfox` managed storage: implemented (Ashfox storage HTTP API)
- `appwrite` storage: implemented (Storage API + optional metadata collection)

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
