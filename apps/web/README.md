# Ashfox Web App

Next.js dashboard + API server for native pipeline visibility.

Current scope:
- Dashboard shell (`/`)
- Health API (`/api/health`)
- Projects API (`/api/projects`)
- Project jobs API (`/api/projects/[projectId]/jobs`)
- Project stream SSE API (`/api/projects/[projectId]/stream`)

Environment variables:
- `ASHFOX_PERSISTENCE_PRESET` (default `local`)
- `ASHFOX_DB_PROVIDER` (default from preset)
- `ASHFOX_STORAGE_PROVIDER` (default from preset)

Run locally:

```bash
cd apps/web
npm install
npm run dev
```

Default local web port is `8686`.

Design intent:
- Use Next.js route handlers for API control endpoints.
- Keep heavy MCP execution in `apps/mcp-gateway`.
- Keep async/batch operations in `apps/worker`.
