# Texture + UV Spec (bbmcp)

This document defines the canonical rules for UVs and texturing in bbmcp.

## Core Invariants
1) Manual per-face UVs only.
   - UVs must be explicit per face; there is no auto-UV painting path.
2) Paint only inside UV rects.
   - `apply_texture_spec` and `generate_texture_preset` paint through uvPaint rects when painting.
3) No UV overlaps unless identical.
   - Overlapping UV rects are errors unless they are exactly the same rect.
4) Scale consistency is enforced.
   - UV size per face must match the expected size derived from model dimensions and `uvPolicy`.

## uvUsageId Contract
- `preflight_texture` computes `uvUsageId` (call without texture filters for a stable id).
- `apply_uv_spec`, `apply_texture_spec`, and `generate_texture_preset` require `uvUsageId`.
- If UVs change, call `preflight_texture` again and use the refreshed `uvUsageId`.

## Tool Responsibilities

### preflight_texture
- Builds the UV mapping table and computes `uvUsageId`.
- Reports warnings for overlaps, unresolved refs, and bounds issues.

### apply_uv_spec
- Updates per-face UVs only.
- Requires `uvUsageId`.
- Guards against overlaps and scale mismatches on affected textures.
- Returns a new `uvUsageId` after applying.

### assign_texture / set_face_uv
- Only change bindings or UV coordinates.
- Do not paint.

### apply_texture_spec / generate_texture_preset
- Paint only (uvPaint enforced when painting).
- Require `uvUsageId`.
- Block on overlap/scale mismatch.
- `apply_texture_spec` supports `autoRecover` (auto_uv_atlas -> preflight -> retry once). For presets, use `texture_pipeline` autoRecover or recover manually.
- Optional `detectNoChange=true` compares output to existing pixels and returns `applied: false` when identical (default false to avoid extra cost).

### auto_uv_atlas
- Recomputes UV layout per texture + face size.
- Doubles texture resolution as needed (bounded by maxTextureSize).
- Does not repaint textures.

## Expected UV Size
Expected UV size is computed from:
- `uvPolicy.modelUnitsPerBlock` (default 16)
- project texture resolution
- face dimensions (from cube size)

If the actual UV size deviates beyond `uvPolicy.scaleTolerance` (default 0.1), the operation fails.

## Recommended Flow
1) `assign_texture` -- bind texture to cubes.
2) `preflight_texture` -- obtain `uvUsageId`.
3) `apply_uv_spec` -- set per-face UVs (or use `set_face_uv` directly).
4) `preflight_texture` -- obtain new `uvUsageId` after UV changes.
5) Paint using `apply_texture_spec` or `generate_texture_preset`.
6) `render_preview` to validate.
7) If errors occur, run `auto_uv_atlas`, then re-preflight and repaint.

## Error Codes
- `validate` may report: `uv_overlap`, `uv_scale_mismatch`, `uv_scale_mismatch_summary`.
- Mutation guards return `invalid_state` on uvUsageId mismatch, overlap, or scale mismatch.
- Missing `uvUsageId` returns `invalid_payload` (or `invalid_state` in `texture_pipeline`).

## Example: ModelSpec (Rooted Rig)
```json
{
  "model": {
    "rigTemplate": "empty",
    "bones": [
      { "id": "root", "pivot": [0, 0, 0] },
      { "id": "body", "parentId": "root", "pivot": [0, 6, 0] }
    ],
    "cubes": [
      { "id": "body", "parentId": "body", "from": [-4, 0, -2], "to": [4, 12, 2] }
    ]
  }
}
```

## Example: UV-First Texture Paint
```json
{
  "preset": "wood",
  "name": "pot_wood",
  "width": 64,
  "height": 64,
  "uvUsageId": { "$ref": { "kind": "tool", "tool": "preflight_texture", "pointer": "/uvUsageId" } },
  "mode": "create"
}
```
