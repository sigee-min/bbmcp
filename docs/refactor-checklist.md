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
- `model_pipeline` creates/updates bones and cubes (merge/replace/planOnly).
- `texture_pipeline` runs an end-to-end flow (assign -> preflight -> uv -> paint -> preview).
- `entity_pipeline` applies model + textures + animations for GeckoLib.
- `block_pipeline` generates blockstate/model/item JSON and stores resources.
- `preflight_texture` returns uvUsageId + warnings + recommendedResolution.
- `apply_uv_spec` updates UVs and returns a new uvUsageId.
- `apply_texture_spec` create/update mutates textures and revision.
- `generate_texture_preset` create/update works with uvUsageId.
- `auto_uv_atlas` plans/applies and updates resolution when needed.
- `assign_texture` binds textures without changing UVs.
- `set_face_uv` updates per-face UVs as provided.
- `render_preview` returns content output.
- `export` writes a file when path is writable.
- `resources/list` + `resources/templates/list` include guides and block pipeline templates.
