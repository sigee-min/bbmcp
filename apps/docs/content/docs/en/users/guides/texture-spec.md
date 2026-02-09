---
title: "Texture + UV Spec (Summary)"
description: "Texture + UV Spec (Summary)"
---

# Texture + UV Spec (Summary)

Core rules:
1) Per-face UVs only (managed internally; no manual UV tools).
2) paint_faces (cubes) and paint_mesh_face (meshes) map ops into UV rects; mapping controls stretch/tile.
3) UV overlaps are errors.
4) UV scale mismatch is an error.
5) Per-face UV density is controlled by project `uvPixelsPerBlock` (default 16).

Workflow:
- assign_texture
- paint_faces (cubes)
- paint_mesh_face (meshes)
- internal auto-UV runs automatically on cube add and geometry-changing cube updates

Notes:
- UV tools are internal and not exposed over MCP.
- `ensure_project.uvPixelsPerBlock` sets face density; reused projects infer a median from existing UVs.
- validate reports uv_overlap/uv_scale_mismatch; mutation guards return invalid_state on overlap/scale/usage mismatch.
- internal auto-UV may raise texture resolution for atlas capacity; face size comes from `uvPixelsPerBlock`.
- If you provide both cubeId and cubeName in target, both must match. Use one for broader matching.
- `paint_faces` is strict single-write: one target (`cubeId`/`cubeName`, optional `face`) and one op.
- `paint_faces` rejects legacy multi-write fields (`targets`, `ops`, `background`) because schema is strict.
- Omit `target.face` to paint all mapped faces of the target cube.
- `paint_mesh_face` is strict single-op: one target (`meshId`/`meshName`) and one op.
- `paint_mesh_face` supports `scope: "single_face" | "all_faces"`.
- If `scope` is omitted, `paint_mesh_face` infers scope from `target.faceId`:
  - `faceId` present -> `single_face`
  - `faceId` absent -> `all_faces`
- `single_face` requires `target.faceId`; `all_faces` forbids `target.faceId`.
- `paint_faces` defaults to `coordSpace="face"` and auto-fits source size to target face UV when `width/height` is omitted.
- `paint_mesh_face` follows the same `coordSpace` rules (`face` default, `texture` requires explicit size match).
- `coordSpace="texture"` requires explicit `width/height` matching texture size.
- `fill_rect` shade defaults to enabled (`shade: true` behavior).
- `shade` can be `false` or an object with `enabled`, `intensity`, `edge`, `noise`, `seed`, `lightDir`.

This document is the active texture+UV guide exposed via MCP resources.
