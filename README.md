# bbmcp

Blockbench, but programmable.  
bbmcp turns Blockbench into an MCP-native modeling backend with a clean tool surface for AI/agents and scripts.

## Highlights
- MCP-first HTTP server with tool discovery and schema versioning.
- High-level pipelines (`model_pipeline`, `texture_pipeline`, `entity_pipeline`, `block_pipeline`).
- Pipelines may return `planOnly` + `ask_user` prompts when a request is underspecified.
- Optional low-level controls (bones, cubes, textures, export, validate).
- Enable via Settings > bbmcp > Expose Low-Level Tools (Expert).
- Explicit texture assignment via `assign_texture` (no hidden auto-assign).
- Revision guard (`ifRevision`) for safe concurrent edits.
- Preview output as MCP `content` image blocks (base64 PNG).
- Java Block/Item enabled by default; GeckoLib/Animated Java gated by capabilities.
- MCP resources for generated JSON (via `resources/list` and `resources/read`).

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
- The plugin starts an MCP server on `127.0.0.1:8787/mcp` by default.
- Configure host/port/path in `Settings > bbmcp` or via the Help menu action.

## Default Endpoint
```
http://127.0.0.1:8787/mcp
```

## Core Flow (Recommended)
1) `ensure_project` (or `get_project_state`) to confirm an active project and read `revision`.
2) Prefer high-level pipelines (`model_pipeline`, `texture_pipeline`, `entity_pipeline`, `block_pipeline`) with `ifRevision`.
3) `validate` to catch issues early.
4) `render_preview` for images.
5) `export` for JSON output.

## Block Pipeline
`block_pipeline` creates blockstates + models + item models using vanilla parents and stores them as MCP resources.
```json
{
  "name": "adamantium_ore",
  "texture": "adamantium_ore",
  "variants": ["block", "slab", "stairs", "wall"],
  "namespace": "mymod",
  "mode": "json_only"
}
```
Use `resources/list` to discover generated assets and `resources/read` to fetch JSON.

## Entity Pipeline
`entity_pipeline` applies model + textures + animations for GeckoLib projects.
```json
{
  "format": "geckolib",
  "targetVersion": "v4",
  "ensureProject": { "name": "my_entity", "match": "format", "onMissing": "create" },
  "model": {
    "rigTemplate": "empty",
    "bones": [{ "id": "root", "pivot": [0, 0, 0] }]
  },
  "animations": [
    { "name": "idle", "length": 1, "loop": true, "channels": [{ "bone": "root", "channel": "rot", "keys": [{ "time": 0, "value": [0, 0, 0] }] }] }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

## Texture Flow (Recommended)
If low-level tools are not exposed, use `texture_pipeline` to run the entire flow.
- Always `preflight_texture` without filters to get a stable `uvUsageId`.
- If UVs change, preflight again and repaint.
- For 64x64+ textures, prefer `generate_texture_preset`.
- Use `autoRecover=true` (or `auto_uv_atlas`) on overlap/scale issues.
- See `docs/texture-uv-spec.md`, `docs/texture-pipeline-plan.md`, `docs/llm-texture-strategy.md`.

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
- `bbmcp://guide/modeling-workflow` (model_pipeline workflow + ModelSpec)
- `bbmcp://guide/texture-workflow` (uvPaint-first texture workflow + preset example)
- `bbmcp://guide/uv-atlas` (auto atlas packing + resolution growth)
- `bbmcp://guide/texture-spec` (UV/texturing invariants)
- `bbmcp://guide/vision-fallback` (preview/texture snapshots for manual upload)
- `bbmcp://guide/entity-workflow` (geckolib-first entity workflow + version targeting)
- `bbmcp://guide/llm-texture-strategy` (LLM workflow + recovery loop)

## Spec Docs
- `docs/block-pipeline.md`
- `docs/entity-pipeline.md`
- `docs/texture-uv-spec.md`
- `docs/llm-texture-strategy.md`
- `bbmcp://guide/vision-fallback` (preview/texture snapshot workflow for manual uploads)

## Sidecar (Optional)
The plugin prefers an inline server. If unavailable, it can spawn a sidecar.
- Output: `dist/bbmcp-sidecar.js`
- Configure `execPath` in Settings to point to `node` if needed.

## Notes
- The plugin is designed for the latest Blockbench desktop build.
- Tool schemas are strict; use `list_capabilities` and tool definitions as the source of truth.

## License
See `LICENSE`.
