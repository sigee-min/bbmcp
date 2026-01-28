# LLM Texture Strategy (bbmcp)

Use this guide to keep UVs and textures consistent across parts.

Note: If low-level tools are hidden, use `texture_pipeline` for the entire workflow.

## Primary Workflow
1) `assign_texture`
2) `preflight_texture`
3) `apply_uv_spec` (or `set_face_uv`)
4) `preflight_texture` again
5) `apply_texture_spec` or `generate_texture_preset`
6) `render_preview`

Notes:
- Use `ifRevision` for mutations.
- Call `preflight_texture` without texture filters to get a stable `uvUsageId`.

## Error Recovery (Always)
If `validate` reports `uv_overlap` / `uv_scale_mismatch`, or a mutation returns `invalid_state` mentioning overlap/scale or uvUsageId mismatch:
1) `auto_uv_atlas` with `apply=true`
2) `preflight_texture` again (new `uvUsageId`)
3) Repaint with `apply_texture_spec` or `generate_texture_preset`

Tip: `apply_texture_spec` and `texture_pipeline` support `autoRecover=true` to run the recovery loop once automatically.

## Common Pitfalls
- All faces mapped to full texture (e.g., [0,0,32,32]) causes scale mismatch.
- Changing textureResolution after painting requires repainting.
- UV overlap is only allowed if rectangles are identical.

## Macro Tool (Optional)
Use `texture_pipeline` to run the standard flow in one call:
`assign_texture ??preflight_texture ??apply_uv_spec ??preflight_texture ??apply_texture_spec/generate_texture_preset ??render_preview`.

Example (textures + preview):
```json
{
  "assign": [{ "textureName": "pot", "cubeNames": ["pot"] }],
  "uv": { "assignments": [{ "cubeName": "pot", "faces": { "north": [0,0,16,16] } }] },
  "textures": [{ "mode": "create", "name": "pot", "width": 16, "height": 16, "ops": [] }],
  "preview": { "mode": "fixed", "output": "single", "angle": [30, 45, 0] },
  "autoRecover": true
}
```

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
