# Texture + UV Spec (bbmcp)

This document defines the canonical rules for UVs and texturing in bbmcp.

## Core Invariants
1) Manual per-face UVs only.
   - UVs are explicit per face; tools only read/write per-face UVs.
2) Paint only inside UV rects.
   - `generate_texture_preset` respects uvPaint rects when painting.
3) No UV overlaps unless identical.
   - Overlapping UV rects are errors unless they are exactly the same rect.
4) Scale consistency is enforced.
   - UV size per face must match the expected size derived from model dimensions and `uvPolicy`.

## uvUsageId Contract
- `preflight_texture` computes `uvUsageId` (call without texture filters for a stable id).
- `generate_texture_preset` requires `uvUsageId`.
- `uvUsageId` includes per-face UVs and per-texture width/height when available; resizing textures changes the id.
- When per-texture sizes are missing, `uvUsageId` also incorporates the project texture resolution, so resolution-only changes refresh the id.
- If UVs or texture sizes change, call `preflight_texture` again and use the refreshed `uvUsageId`.

## Tool Responsibilities

### preflight_texture
- Builds the UV mapping table and computes `uvUsageId`.
- Reports warnings for overlaps, unresolved refs, and bounds issues.
- Warns when UV rects are very small or highly non-square; stretch-mapped patterns may look distorted in those cases.
- Warns when UV scale mismatches are detected (often due to tiny faces at low resolution).

### set_face_uv
- Updates per-face UVs only (one cube per call).
- Guards against out-of-bounds UVs.
- Does not require `uvUsageId`.
- Scale/overlap consistency is enforced by preflight/paint/validate, not by set_face_uv itself.
- Emits warnings for tiny or skewed UV rects; thresholds scale with texture resolution.

### assign_texture
- Binds a texture to cubes/faces.
- Does not paint or change UVs.

### generate_texture_preset
- Paint only (uvPaint enforced when painting).
- Requires `uvUsageId`.
- Blocks on overlap/scale mismatch.

### auto_uv_atlas
- Recomputes UV layout per texture + face size.
- May grow texture resolution (bounded by maxTextureSize).
- Does not repaint textures.

## Expected UV Size
Expected UV size is computed from:
- `uvPolicy.modelUnitsPerBlock` (default 16)
- texture resolution (per-texture width/height when available; otherwise project texture resolution)
- face dimensions (from cube size)

If the actual UV size deviates beyond `uvPolicy.scaleTolerance` (default 0.1), the operation fails.

## Recommended Flow
1) `assign_texture` -- bind texture to cubes.
2) `preflight_texture` -- obtain `uvUsageId`.
3) `set_face_uv` -- set per-face UVs (repeat per cube).
4) `preflight_texture` -- obtain new `uvUsageId` after UV changes.
5) Paint using `generate_texture_preset`.
6) `render_preview` to validate.
7) If errors occur, run `auto_uv_atlas` (apply=true), then re-preflight and repaint.

## Error Codes
- `validate` may report: `uv_overlap`, `uv_scale_mismatch`, `uv_scale_mismatch_summary`.
- Mutation guards return `invalid_state` on uvUsageId mismatch, overlap, or scale mismatch.
- Missing `uvUsageId` returns `invalid_payload`.

## Example: Low-level Modeling (Rooted Rig)
```json
{ "name": "root", "pivot": [0, 0, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```
```json
{ "name": "body", "bone": "root", "from": [-4, 0, -2], "to": [4, 12, 2], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
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
