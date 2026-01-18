# Refactor Guardrails

## Invariants
- Tool schemas and error codes stay stable.
- `ifRevision` behavior stays unchanged.
- `ToolResponse` structure stays unchanged.
- MCP server still responds on the configured host/port/path.

## Manual Verification
- `list_capabilities` returns expected version and limits.
- `create_project(ifRevision)` succeeds.
- `add_bone` and `add_cube` succeed.
- `apply_texture_spec` updates state and revision.
- `render_preview` returns content output.
- `export` writes a file when path is writable.
