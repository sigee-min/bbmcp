# Ashfox Web App

Next.js dashboard + API server for native pipeline visibility.

Current scope:
- Dashboard shell (`/`)
- Health API (`/api/health`)
- MCP proxy API (`/api/mcp`) forwarding to `ASHFOX_GATEWAY_URL`
- Projects API (`/api/projects`)
- Project jobs API (`/api/projects/[projectId]/jobs`)
- Project stream SSE API (`/api/projects/[projectId]/stream`)

Environment variables:
- `ASHFOX_GATEWAY_URL` (default `http://127.0.0.1:8790/mcp`)

Run locally:

```bash
cd apps/web
npm install
npm run dev
```

Design intent:
- Use Next.js route handlers for API control endpoints.
- Keep heavy MCP execution in `apps/mcp-gateway`.
- Keep async/batch operations in `apps/worker`.
