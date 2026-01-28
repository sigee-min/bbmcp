# Texture Pipeline (Current)

## Purpose
Document the current texture workflow and tool behavior used by bbmcp.

## Tool Surface
Primary:
- `texture_pipeline` (macro pipeline)

Supporting tools:
- `assign_texture`, `set_face_uv`
- `preflight_texture`
- `apply_uv_spec`
- `apply_texture_spec`
- `generate_texture_preset`
- `auto_uv_atlas`
- `render_preview`
- `read_texture`
- `set_project_texture_resolution`

Note: Supporting tools are exposed only when low-level tools are enabled.

## texture_pipeline Behavior
- Accepts steps: `assign`, `preflight`, `uv`, `textures`, `presets`, `preview`.
- Requires at least one step.
- Runs `preflight_texture` automatically when UV or paint steps are present.
- If the UV step runs and `preflight` is requested, it preflights again after UV changes.
- For texture/preset steps, it ensures a valid `uvUsageId` (preflighting if needed).
- Enforces UV guards (usage id, overlap, scale).
- Optional `autoRecover=true` runs `auto_uv_atlas` (apply=true) -> `preflight_texture` -> retry once for overlap/scale/usage mismatch.
- Painting is uvPaint-only (no raw image import tool).
- Honors `ifRevision` for mutation steps; preview is read-only.
- If `planOnly=true` or the payload is underspecified, the pipeline skips mutations and returns `nextActions` with short `ask_user` prompts.

## apply_texture_spec / generate_texture_preset
- Require `uvUsageId` and enforce UV guards.
- `apply_texture_spec` uses deterministic ops + uvPaint mapping and records `report.textureCoverage`.
- `generate_texture_preset` paints a procedural preset into uvPaint rects.
- `apply_texture_spec` supports `autoRecover`; `texture_pipeline` can autoRecover for both textures and presets.
- Optional `detectNoChange=true` compares output to existing pixels and returns `applied: false` when identical (default false to avoid extra cost).

## apply_uv_spec
- Updates per-face UVs only.
- Requires `uvUsageId` and returns a refreshed `uvUsageId`.
- Suggests a follow-up preflight via `nextActions`.

## preflight_texture
- Computes `uvUsageId`, `uvBounds`, `usageSummary`, and optional `textureUsage`.
- Emits warnings for overlaps, unresolved references, and bounds issues.
- Recommends a resolution when bounds exceed the current size.

## Outputs (Structured)
- `texture_pipeline` returns `{ steps, applied, planOnly?, uvUsageId? }` (applied=false when planOnly).
- `apply_texture_spec` returns `{ applied: true, report, recovery?, uvUsageId? }`.
- `apply_uv_spec` returns `{ applied: true, cubes, faces, uvUsageId }`.
- `render_preview` returns MCP `content` image blocks plus structured metadata.

## Invariants
- Manual per-face UVs only.
- Overlapping UVs are errors unless identical.
- UV scale mismatch blocks painting and UV updates.
- Painting stays inside UV rects (uvPaint enforced).
