# Refactor Guardrails

## Invariants
- Tool schemas and error codes stay stable.
- `ifRevision` behavior stays unchanged (mutations require it; read-only calls do not).
- `ToolResponse` + `nextActions` structure stays unchanged.
- MCP server still responds on the configured host/port/path.
- Resource URIs and templates stay stable.

## Manual Verification
- `list_capabilities` returns expected versions/limits/toolRegistry hash.
- `ensure_project` creates or reuses a project as expected.
- `get_project_state` returns a fresh revision after mutations.
- `add_bone`/`add_cube` create bones/cubes one at a time (root auto-create for cubes).
- `preflight_texture` returns uvUsageId + warnings + recommendedResolution.
- `set_face_uv` updates per-face UVs as provided.
- `generate_texture_preset` create/update works with uvUsageId.
- `auto_uv_atlas` plans/applies and updates resolution when needed (low-level only).
- `assign_texture` binds textures without changing UVs.
- `create_animation_clip` / `set_keyframes` / `set_trigger_keyframes` apply animation changes for supported formats.
- `render_preview` returns content output.
- `export` writes a file when path is writable.
- `resources/list` + `resources/templates/list` include guides.
