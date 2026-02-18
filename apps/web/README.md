# Ashfox Web App

CSR dashboard UI for native pipeline visibility (React + Vite).

Current scope:
- Dashboard shell (`/`)
- Client-side API/SSE calls routed directly to gateway (`/api/*` on gateway)

Environment variables:
- `VITE_ASHFOX_GATEWAY_API_BASE_URL` (default `/api`)

Run locally:

```bash
cd apps/web
npm install
npm run dev
```

Default local web port is `8686`.

Static export build:

```bash
cd apps/web
npm run build
npm run start
```

`npm run build` outputs static files to `apps/web/dist`.

Design intent:
- Keep web as UI-only client.
- Route API/SSE through gateway (`apps/gateway`).
- Keep async/batch operations in `apps/worker`.
