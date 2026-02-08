# bbmcp

Blockbench MCP bridge plugin. bbmcp exposes a low-level, deterministic tool surface for modeling, texturing, and animation over MCP.

## Install from URL (Quick)
In Blockbench Desktop:
1) Open `File > Plugins > Load Plugin from URL`
2) Paste the URL below
3) Click install/load

```text
https://github.com/sigee-min/bbmcp/releases/latest/download/bbmcp.js
```

## Showcase
Real output from bbmcp, created from natural language in under 5 minutes.
No manual setup.

| Item | Value |
| --- | --- |
| Workflow | bone, cube, uv, texture, animation |
| Build time | < 5 minutes |
| Generation model | gpt-5.3-codex xhigh |

![Greyfox Animation](assets/images/greyfox-animation.gif)

| Final Model (Hero) | Texture Atlas |
| --- | --- |
| ![Greyfox Model](assets/images/greyfox.png) | ![Greyfox Texture](assets/images/greyfox-texture.png) |

## Features
- Low-level modeling only: add_bone/add_cube/add_mesh (one item per call).
- Mesh UV and face layout are managed through add_mesh/update_mesh with uvPolicy.
- Low-level animation only: create_animation_clip + set_frame_pose.
- UVs are managed internally with assign_texture, paint_faces (cubes), and paint_mesh_face (meshes) (no manual UV tools).
- Auto UV atlas runs on cube add and geometry-changing cube updates; pixels are reprojected to follow the new layout.
- Auto density reduction when atlas overflows (uvPixelsPerBlock is lowered to fit).
- Revision guard (ifRevision) for safe concurrent edits.
- Preview output as MCP content blocks (base64 PNG) plus structured metadata.
- MCP resource guides via resources/list + resources/read.

## Requirements
- Blockbench desktop (latest).
- Node.js for build scripts.

## Install
```bash
npm install
npm run build
```

Load the plugin in Blockbench:
- Use the plugin manager, or load dist/bbmcp.js manually.

## Quickstart
1) Start Blockbench (plugin loads and starts the MCP server).
2) Connect to the MCP endpoint (default below).
3) Call list_capabilities to read schemas + limits.

Default endpoint:
```
http://0.0.0.0:8787/mcp
```
Note: 0.0.0.0 binds all interfaces. Use 127.0.0.1 for local-only access.

## Endpoint Configuration
Config precedence (highest to lowest):
1) Blockbench Settings (bbmcp: Server)
2) Environment variables: BBMCP_HOST, BBMCP_PORT, BBMCP_PATH
3) Defaults

Environment example:
```bash
BBMCP_HOST=127.0.0.1
BBMCP_PORT=8787
BBMCP_PATH=/mcp
```

## Recommended Flow
Project setup:
1) ensure_project (or get_project_state) to confirm active project and revision.
2) Use ifRevision for every mutation.
3) validate to catch issues early.
4) render_preview for visuals.
5) export for JSON output.

Modeling:
- add_bone (optional)
- add_cube (one cube per call)
- add_mesh (one mesh per call)
- update_mesh (geometry/uvPolicy updates)
- update_bone / update_cube for edits

Texturing:
- assign_texture
- paint_faces (cubes)
- paint_mesh_face (meshes)
- render_preview

Animation:
- create_animation_clip
- set_frame_pose (one frame per call)
- set_trigger_keyframes (optional)

Notes:
- ensure_project auto-creates a texture named after the project when none exists.
- UVs are managed internally; clients never send UV data.
- Cube add/scale triggers auto UV atlas; repaint if needed.
- `paint_mesh_face` scope is inferred by default (`faceId` -> `single_face`, no `faceId` -> `all_faces`) unless explicitly set.

## Supported Formats
| Format | Status | Notes |
| --- | --- | --- |
| Java Block/Item | Supported | Default format. |
| GeckoLib | Supported | Capability-gated. |
| Animated Java | Supported | Capability-gated. |
| Image (2D) | Experimental | Format id: `image`; image-editor workflows vary by host/runtime. |
| Generic Model | Supported | Format id: `free`; Unity/Godot/Unreal-oriented generic workflow. |

## Support Limits
- Extremely large models can exceed atlas capacity even after auto density reduction.
- Faces that exceed maximum atlas bounds return uv_size_exceeds and are not supported.

## Tool Discovery
If toolRegistry.hash changes, re-run list_capabilities (or tools/list) to refresh schemas.

## Guides and Specs
- docs/guides/texture-spec.md
- docs/guides/llm-texture-strategy.md
- MCP resources: bbmcp://guide/* (see resources/templates/list)

## Development
Build:
```bash
npm run build
```

Tests:
```bash
npm test
```

Quality checks:
```bash
npm run quality:check
```

## Release Automation
- `release-please` manages release PRs from conventional commits on `main`.
- Merging the release PR updates `package.json`/`CHANGELOG.md` via bot.
- GitHub Release publication is automated by `.github/workflows/release-major.yml`.
- Publish policy:
  - first release: auto-create
  - after bootstrap: only `major`/`minor` version bumps publish releases
  - `patch` bumps are intentionally skipped

## Community and Security
- Contributing guide: `CONTRIBUTING.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Support and issue reporting: `SUPPORT.md`
- Security policy and vulnerability reporting: `SECURITY.md`
- Public release checklist: `docs/release-public-checklist.md`

## License
See LICENSE.
