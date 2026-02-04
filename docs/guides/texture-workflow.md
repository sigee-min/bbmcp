# Texture Workflow (UV-first)

Goal: paint only within UV rects so patterns scale correctly.

Steps:
1) ensure_project / get_project_state (capture revision)
2) assign_texture (bind texture to cubes)
3) preflight_texture (get uvUsageId + mapping)
4) set_face_uv (low-level UV edits)
5) preflight_texture again (UVs changed -> new uvUsageId)
6) generate_texture_preset using uvUsageId
7) render_preview to validate

Notes:
- uvPaint is enforced; only UV rects are painted.
- Small or highly non-square UV rects can make `uvPaint.mapping:"stretch"` look distorted. Consider `mapping:"tile"`, a higher texture resolution (32/64), or re-pack UVs.
- If you see uv_scale_mismatch, your UVs are too small for the model at the current resolution. Increase resolution (64+), reduce cube count, or allow split textures.
- Use auto_uv_atlas (apply=true) to recover from overlap/scale issues.
- Call preflight_texture without texture filters for a stable uvUsageId.
- If UVs change, preflight again and repaint.
- For >=64px textures, use generate_texture_preset.
- set_face_uv may return warnings when UV rects are tiny or skewed; thresholds adapt to texture resolution. Follow nextActions to run preflight_texture.
- When specifying both cubeIds and cubeNames in targets, both must match. Use only one to avoid overly narrow matches.

Example (generate_texture_preset):
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

Example (preflight_texture):
```json
{
  "includeUsage": true
}
```

Example (set_face_uv):
```json
{
  "cubeName": "body",
  "faces": {
    "north": [0, 0, 8, 12],
    "south": [8, 0, 16, 12]
  },
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```
