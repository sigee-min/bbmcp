# LLM Texture Strategy (bbmcp)

Use this guide to keep UVs and textures consistent across parts.

## Primary Workflow
1) `assign_texture`
2) `preflight_texture`
3) `set_face_uv`
4) `preflight_texture` again
5) `generate_texture_preset`
6) `render_preview`

Notes:
- Use `ifRevision` for mutations.
- Call `preflight_texture` without texture filters to get a stable `uvUsageId`.

## Error Recovery (Always)
If `validate` reports `uv_overlap` / `uv_scale_mismatch`, UVs are missing, or a mutation returns `invalid_state` mentioning overlap/scale or uvUsageId mismatch:
1) Run `auto_uv_atlas` (apply=true) to re-pack UVs.
2) Repaint with `generate_texture_preset`.

## Common Pitfalls
- All faces mapped to full texture (e.g., [0,0,32,32]) causes scale mismatch.
- Changing textureResolution after painting requires repainting.
- UV overlap is only allowed if rectangles are identical.

## Minimal Examples

Preflight:
```json
{ "includeUsage": true }
```

Atlas:
```json
{ "apply": true }
```

Generate preset:
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
