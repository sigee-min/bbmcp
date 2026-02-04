# bbmcp

Blockbench, but programmable.  
bbmcp turns Blockbench into an MCP-native modeling backend with a clean tool surface for AI/agents and scripts.

## Highlights
- MCP-first HTTP server with tool discovery and schema versioning.
- Modeling is low-level only (`add_bone`, `add_cube`).
- Low-level tools are exposed for deterministic workflows.
- Explicit texture assignment via `assign_texture` (no auto-assign).
- Per-face UVs via `set_face_uv`; preset painting via `generate_texture_preset`.
- Revision guard (`ifRevision`) for safe concurrent edits.
- Preview output as MCP `content` image blocks (base64 PNG).
- Java Block/Item enabled by default; GeckoLib/Animated Java gated by capabilities.
- MCP resources for guides (via `resources/list` and `resources/read`).

## Quickstart
1) Install dependencies
```bash
npm install
```

2) Build
```bash
npm run build
```

3) Load the plugin in Blockbench
- Blockbench desktop only.
- Use the plugin manager or load `dist/bbmcp.js` manually.

4) Start MCP
- The plugin starts an MCP server on `0.0.0.0:8787/mcp` by default.
- Configure host/port/path via Settings (bbmcp: Server), user config (`%APPDATA%\\bbmcp\\endpoint.json` or `~/.bbmcp/endpoint.json`), project config (`.bbmcp/endpoint.json`), or env vars (`BBMCP_HOST`, `BBMCP_PORT`, `BBMCP_PATH`).

## Default Endpoint
```
http://0.0.0.0:8787/mcp
```
`0.0.0.0` binds to all interfaces. Use `127.0.0.1` for local-only access.
### Endpoint Config
Create `.bbmcp/endpoint.json` in the working directory, or a user config at `%APPDATA%\\bbmcp\\endpoint.json` (Windows) / `~/.bbmcp/endpoint.json` (macOS/Linux):
```json
{ "host": "0.0.0.0", "port": 8787, "path": "/mcp" }
```
Settings values override the config file if set. Env vars override user/project files: `BBMCP_HOST`, `BBMCP_PORT`, `BBMCP_PATH`. If Settings are saved, they take precedence over env/file.

## Tool Discovery Notes
- If `toolRegistry.hash` changes, re-run `tools/list` or `list_capabilities` to refresh schemas.

## Core Flow (Recommended)
1) `ensure_project` (or `get_project_state`) to confirm an active project and read `revision`.
   - The project dialog is auto-confirmed; supply `ensure_project.dialog` with required fields to avoid UI prompts.
   - To close a project, call `ensure_project` with `action="delete"` and `target.name` matching the open project; set `force=true` to discard unsaved changes (no auto-save).
2) Use low-level modeling (`add_bone`, `add_cube`) and explicit UV/texture tools with `ifRevision`.
3) `validate` to catch issues early.
4) `render_preview` for images.
5) `export` for JSON output.

## Texture Flow (Recommended)
Use the low-level texture tools explicitly.
1) `assign_texture` to bind textures to cubes/faces.
2) `preflight_texture` (no filters) to get a stable `uvUsageId`.
3) `set_face_uv` to set UVs per face (repeat per cube).
4) `generate_texture_preset` to paint/update textures (uvPaint enforced).
5) If UVs change, repeat `preflight_texture` and repaint.
6) Use `auto_uv_atlas` (apply=true) to recover from overlap/scale issues.
7) Use `delete_texture` to remove textures (blocked if still assigned unless `force=true`).
See `docs/texture-uv-spec.md`, `docs/llm-texture-strategy.md`.

## Preview Output (MCP Standard)
`render_preview` responds with MCP `content` blocks plus `structuredContent` metadata:
```json
{
  "content": [
    {
      "type": "image",
      "mimeType": "image/png",
      "data": "<base64>"
    }
  ],
  "structuredContent": {
    "kind": "single",
    "frameCount": 1,
    "image": {
      "mime": "image/png",
      "width": 766,
      "height": 810,
      "byteLength": 67336
    }
  },
  "_meta": {
    "nextActions": [
      {
        "type": "call_tool",
        "tool": "get_project_state",
        "arguments": { "detail": "summary" },
        "reason": "Refresh revision before follow-up mutations.",
        "priority": 1
      }
    ]
  }
}
```

Notes:
- `_meta` is MCP-standard metadata. This server uses `_meta.nextActions` to suggest follow-up calls.
- `structuredContent` mirrors tool result data without embedding base64.
- See `docs/next-actions.md` for the `nextActions` schema and `$ref` conventions.

## Guides (MCP Resources)
Static guides are exposed via MCP resources. Use `resources/list` and `resources/read` to fetch them.
- Template: `bbmcp://guide/{name}` (see `resources/templates/list`).
- `bbmcp://guide/rigging` (root-based hierarchy example for animation-ready rigs)
- `bbmcp://guide/animation-workflow` (low-level animation workflow)
- `bbmcp://guide/modeling-workflow` (low-level add_bone/add_cube workflow)
- `bbmcp://guide/texture-workflow` (uvPaint-first texture workflow + preset example)
- `bbmcp://guide/uv-atlas` (auto atlas packing + resolution growth)
- `bbmcp://guide/texture-spec` (UV/texturing invariants)
- `bbmcp://guide/vision-fallback` (preview/texture snapshots for manual upload)
- `bbmcp://guide/entity-workflow` (geckolib-first entity workflow + version targeting)
- `bbmcp://guide/llm-texture-strategy` (LLM workflow + recovery loop)

## Spec Docs
- `docs/texture-uv-spec.md`
- `docs/llm-texture-strategy.md`
- `bbmcp://guide/vision-fallback` (preview/texture snapshot workflow for manual uploads)

## Sidecar (Optional)
The plugin prefers an inline server. If unavailable, it can spawn a sidecar.
- Output: `dist/bbmcp-sidecar.js`
- Uses the current Node runtime automatically.

## Notes
- The plugin is designed for the latest Blockbench desktop build.
- Tool schemas are strict; use `list_capabilities` and tool definitions as the source of truth.

## License
See `LICENSE`.
