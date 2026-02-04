# UV Atlas Guide

Use auto_uv_atlas to re-pack UVs when overlaps or scale mismatches occur.

Key points:
- Only identical rects may overlap.
- auto_uv_atlas groups by texture + face size.
- When packing overflows, resolution doubles and packing retries.
- Rect sizes are computed from the starting resolution; increasing size adds space instead of scaling UVs.

Example (plan only):
```json
{
  "apply": false
}
```

Example (apply):
```json
{
  "apply": true
}
```

After apply:
- Call preflight_texture again.
- Repaint textures using the new mapping.
