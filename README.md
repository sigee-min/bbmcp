# bbmcp

Blockbench, but programmable.  
bbmcp turns Blockbench into an MCP-native modeling backend with a clean tool surface for AI/agents and scripts.

## Highlights
- MCP-first HTTP server with tool discovery and schema versioning.
- High-level spec tools (`apply_model_spec`, `apply_texture_spec`).
- Block pipeline generator (`generate_block_pipeline`) for blockstates/models/item models.
- Low-level controls (bones, cubes, textures, export, validate).
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
2) Mutations (`add_bone`, `add_cube`, `apply_*`) with `ifRevision`.
3) `validate` to catch issues early.
4) `render_preview` for images.
5) `export` for JSON output.

## Block Pipeline (Recommended)
`generate_block_pipeline` creates blockstates + models + item models using vanilla parents and stores them as MCP resources.
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

## Texture Flow (Recommended)
1) Lock invariants first: textureResolution, UV policy (manual per-face), and texture count (single atlas vs per-material).
2) `preflight_texture` to build the UV mapping table and recommended resolution.
3) Paint a checker/label texture first to verify orientation and coverage.
4) For 64x64+ textures, prefer `generate_texture_preset` (avoids large ops payloads). For <=32px, `set_pixel` ops are fine.
5) `apply_texture_spec` to create or update texture data via ops (no image import tool).
   - Omit `ops` to create an empty texture (background can still fill).
   - `width/height` are required and should match the project textureResolution.
   - Very low opaque coverage is rejected; fill a larger area or tighten UVs.
   - Success responses include `report.textureCoverage` (opaque ratio + bounds) for each rendered texture.
6) `assign_texture` to bind textures to cubes (required for visible results; does not change UVs).
7) `set_face_uv` to apply per-face UVs explicitly.
8) Prefer material-group textures (pot/soil/plant) and assign via `cubeNames` for stability.
9) If UVs exceed the current resolution, increase it or split textures per material.
10) Size textures to fit the UV layout (width >= 2*(w+d), height >= 2*(h+d)) and round up to 32/64/128; use `set_project_texture_resolution` before creating textures. If you need to scale existing UVs, pass `modifyUv=true` (if supported by the host).
11) If UVs or resolution change after painting, repaint using the new mapping.

## Preview Output (MCP Standard)
`render_preview` responds with MCP `content` blocks:
```json
{
  "content": [
    {
      "type": "image",
      "mimeType": "image/png",
      "data": "<base64>"
    }
  ],
  "meta": {
    "kind": "single",
    "width": 766,
    "height": 810,
    "byteLength": 67336
  }
}
```

## Sidecar (Optional)
The plugin prefers an inline server. If unavailable, it can spawn a sidecar.
- Output: `dist/bbmcp-sidecar.js`
- Configure `execPath` in Settings to point to `node` if needed.

## Notes
- The plugin is designed for the latest Blockbench desktop build.
- Tool schemas are strict; use `list_capabilities` and tool definitions as the source of truth.

## License
See `LICENSE`.
