# <img src="apps/docs/public/favicon-32x32.png" alt="Ashfox icon badge" width="32" height="32" /> Ashfox

Blockbench MCP bridge plugin. Ashfox exposes a low-level, deterministic tool surface for modeling, texturing, and animation over MCP.

Docs: [ashfox.sigee.xyz](https://ashfox.sigee.xyz)

## Contents
- Installation
- Quickstart (first successful request)
- Endpoint Configuration
- Features
- Requirements
- Compatibility
- Recommended Flow
- Supported Formats
- Support Limits
- Tool Discovery
- Guides and Specs
- Repository Layout
- Showcase
- Development
- Release Automation
- Community and Security

## Installation
### Option A: Install from release URL (recommended)
In Blockbench Desktop:
1) Open `File > Plugins > Load Plugin from URL`
2) Paste the URL below
3) Click install/load

```text
https://github.com/sigee-min/ashfox/releases/latest/download/ashfox-bbplugin.js
```

### Option B: Clone and build from source
```bash
git clone https://github.com/sigee-min/ashfox.git
cd ashfox
npm install
npm run build
```

Then load the plugin in Blockbench:
- Use the plugin manager, or load `dist/ashfox-bbplugin.js` manually.

## Quickstart (first successful request)
1) Start Blockbench with Ashfox enabled.
2) Connect your MCP client to:

```text
http://127.0.0.1:8787/mcp
```

3) Send a first connectivity check (`tools/list`):

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"
```

Expected response shape (trimmed):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      { "name": "list_capabilities" },
      { "name": "ensure_project" }
    ]
  }
}
```

4) Call `list_capabilities` (schema + limits snapshot):

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"list_capabilities\",\"arguments\":{}}}"
```

Expected response shape (trimmed):
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "structuredContent": {
      "pluginVersion": "0.0.x",
      "toolSchemaVersion": "YYYY-MM-DD",
      "blockbenchVersion": "x.y.z",
      "limits": {
        "maxCubes": 2048,
        "maxTextureSize": 2048,
        "maxAnimationSeconds": 120
      }
    }
  }
}
```

Quick checks if it fails:
- Confirm Ashfox plugin is loaded in Blockbench Desktop.
- Confirm URL/path is exactly `http://127.0.0.1:8787/mcp`.
- If custom host/port/path is used, verify settings and env vars match.

## Endpoint Configuration
Config precedence (highest to lowest):
1) Blockbench Settings (`ashfox: Server`)
2) Environment variables: `ASHFOX_HOST`, `ASHFOX_PORT`, `ASHFOX_PATH`
3) Defaults

Environment example:
```bash
ASHFOX_HOST=127.0.0.1
ASHFOX_PORT=8787
ASHFOX_PATH=/mcp
```

Address notes:
- Server bind defaults to `0.0.0.0:8787`.
- Local client connection should use `127.0.0.1:8787` or `localhost:8787`.
- Path default is `/mcp`.

## Features
- Low-level modeling only: add_bone/add_cube (one item per call).
- Low-level animation only: create_animation_clip + set_frame_pose.
- UVs are managed internally with assign_texture and paint_faces (no manual UV tools).
- Auto UV atlas runs on cube add and geometry-changing cube updates; pixels are reprojected to follow the new layout.
- Auto density reduction when atlas overflows (uvPixelsPerBlock is lowered to fit).
- Revision guard (ifRevision) for safe concurrent edits.
- Preview output as MCP content blocks (base64 PNG) plus structured metadata.
- MCP resource guides via resources/list + resources/read.

## Requirements
- Blockbench desktop (latest).
- Node.js for build scripts.

## Compatibility
| Component | Current baseline |
| --- | --- |
| Blockbench | Desktop (latest stable) |
| Node.js (plugin repo) | Node 20 in CI (`quality`, `build-plugin-desktop`, `build-ashfox`) |
| Node.js (docs static check) | Node 24 in CI (`docs-static-check`) |
| Protocol | MCP JSON-RPC over HTTP (`/mcp`) |

## Recommended Flow
Project setup:
1) ensure_project (or get_project_state) to confirm active project and revision.
2) Use ifRevision for every mutation.
3) validate to catch issues early.
4) render_preview for visuals.
5) export for JSON or native codec output (for example glTF/OBJ/FBX when available).

Modeling:
- add_bone (optional)
- add_cube (one cube per call)
- update_bone / update_cube for edits

Texturing:
- assign_texture
- paint_faces
- render_preview

Animation:
- create_animation_clip
- set_frame_pose (one frame per call)
- set_trigger_keyframes (optional)

Notes:
- ensure_project auto-creates a texture named after the project when none exists.
- UVs are managed internally; clients never send UV data.
- Cube add/scale triggers auto UV atlas; repaint if needed.

## Supported Formats
| Layer | Status | Notes |
| --- | --- | --- |
| Authoring (`ensure_project`) | `geckolib` only | Non-`geckolib` authoring requests are rejected. |
| Export (`export.format`) | `gecko_geo_anim`, `gltf`, `native_codec` | Export targets are selected at export time. |

## Support Limits
- Extremely large models can exceed atlas capacity even after auto density reduction.
- Faces that exceed maximum atlas bounds return uv_size_exceeds and are not supported.

## Tool Discovery
If toolRegistry.hash changes, re-run list_capabilities (or tools/list) to refresh schemas.

## Guides and Specs
- apps/docs/content/docs/en/guides/texture-spec.md
- apps/docs/content/docs/en/guides/llm-texture-strategy.md
- MCP resources: ashfox://guide/* (see resources/templates/list)

## Repository Layout
- `apps/plugin-desktop`: plugin app entrypoint (desktop runtime boundary)
- `apps/ashfox`: headless MCP app entrypoint (sidecar boundary)
- `apps/mcp-gateway`: multi-backend MCP gateway shell (tool routing + project locks)
- `apps/worker`: async worker for native pipeline jobs + heartbeat
- `apps/web`: Next.js dashboard and API services
- `apps/docs`: user-facing docs site
- `packages/runtime`: shared runtime implementation (plugin + server + usecases)
- `packages/contracts`: MCP contract source (`mcpSchemas`) + schema policy (`version/hash`)
- `packages/conformance`: contract conformance checks (schema coverage + validation behavior)
- `packages/backend-core`: backend contracts/registry/locks shared by gateway runtimes
- `packages/backend-blockbench`: blockbench backend adapter (dispatcher bridge)
- `packages/backend-engine`: clean-room engine backend
- `deploy/docker-compose.yml`: image-based multi-service deployment (`web + mcp-gateway + worker + postgres`)
- `deploy/docker-compose.build.yml`: source-build override for local image creation
- `deploy/.env.example`: deploy-time env/image template
- `apps/docs/content/docs/en/contributors/project/development-onboarding.mdx`: contributor onboarding for build/test/release

## Showcase
Sample output generated with Ashfox tool calls (modeling/texturing/animation).  
Generation time and final quality vary by prompt, model, and runtime environment.

![Ashfox Animation](apps/docs/public/assets/images/ashfox-animation.gif)

| Final Model (Hero) | Texture Atlas |
| --- | --- |
| ![Ashfox Model](apps/docs/public/assets/images/ashfox.png) | ![Ashfox Texture](apps/docs/public/assets/images/ashfox-texture.png) |

## Development
Install dependencies:
```bash
npm install
```

Runtime test dependency policy:
- keep `ts-node` pinned only at the repository root (`package.json` + `package-lock.json`)
- use `npm run verify:runtime-test-policy` before commit or CI handoff

Core scripts:
| Script | Purpose |
| --- | --- |
| `npm run build` | Build plugin + headless bundles into `dist/` |
| `npm run build:plugin-desktop` | Build only the Blockbench plugin bundle |
| `npm run build:ashfox` | Build only the headless MCP bundle |
| `npm run dev:gateway` | Start MCP gateway (local) |
| `npm run dev:worker` | Start worker (local) |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run test:unit` | Run runtime unit tests (`packages/runtime/tests`) |
| `npm run test:conformance` | Run contract/conformance tests |
| `npm run test:practical` | Run high-value regression + contract smoke pack |
| `npm test` | Run `typecheck + unit + conformance` |
| `npm run test:cov` | Run unit tests with coverage output |
| `npm run verify:runtime-test-policy` | Verify root-only `ts-node` policy for runtime tests |
| `npm run quality` | Run the full CI quality gate |
| `npm run quality:check` | Run static quality checks (typecheck + policy checks) |
| `npm run quality:deadcode` | Fail on unused exports |
| `npm run quality:coverage` | Enforce coverage thresholds |
| `npm run quality:audit` | Run dependency vulnerability audit |
| `npm run spec:sync` | Refresh Blockbench spec snapshot used by tests |

Docs site build (workspace-local):
```bash
cd apps/docs
npm ci
npm run build
```

Web dashboard build:
```bash
cd apps/web
npm install
npm run build
```

Docker compose (deployment, image-based):
```bash
cd deploy
cp .env.example .env
# edit .env and set ASHFOX_*_IMAGE to published registry tags
docker compose up -d
```

Docker compose (local source build override):
```bash
cd deploy
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Release Automation
- Single publish workflow: `.github/workflows/release.yml` (manual `workflow_dispatch` only).
- No release PR is created. Running the workflow builds artifacts and publishes a GitHub Release directly.
- App versions are managed independently in each app package:
  - `apps/ashfox/package.json`
  - `apps/plugin-desktop/package.json`
  - `apps/mcp-gateway/package.json`
  - `apps/worker/package.json`
  - `apps/web/package.json`
  - `apps/docs/package.json`
- Plugin runtime version policy:
  - `apps/plugin-desktop` and `apps/ashfox` are kept in lockstep.
  - `packages/runtime/src/config.ts` `PLUGIN_VERSION` is injected at build time from `apps/plugin-desktop/package.json`.
  - `npm run version:sync:runtime` validates and reports the runtime version source.
  - `npm run version:check:runtime` is the strict CI gate for lockstep/version injection policy.
- Release title policy:
  - Title is date-based: `Ashfox Update YYYY-MM-DD`.
  - Tag is generated from date and commit SHA to avoid collisions.
- Release note policy:
  - Primary: GitHub auto-generated release notes (`generate_release_notes`).
  - Fallback: repo script-generated notes from commits and app version table (`.github/release-notes.generated.md`).

## Community and Security
- Contributing guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Support and issue reporting: `SUPPORT.md`
- Security policy and vulnerability reporting: `SECURITY.md`
- Public release checklist: `apps/docs/content/docs/en/contributors/project/release-public-checklist.mdx`

## License
See LICENSE.
