---
title: "Texture Workflow"
description: "Guide-first texture workflow with auto-UV assumptions and paint discipline."
summary: "Guide-first texture workflow with auto-UV assumptions and paint discipline."
---

# Texture Workflow

Texture work is most stable when it is treated as a continuation of modeling, not a separate final step. Ashfox manages UV internals for you, so the practical focus should be on mapping intent, paint consistency, and fast visual verification.

A typical texture session starts by confirming project state and active texture, then applying small paint operations, and validating appearance with preview renders. This makes issues visible early and keeps repaint effort low.

## Recommended flow

1. Confirm state with `ensure_project` or `get_project_state`.
2. Bind texture context with `assign_texture`.
3. Apply paint operations with `paint_faces` for cubes or `paint_mesh_face` for meshes.
4. Run `render_preview` after each meaningful visual milestone.

`uvPixelsPerBlock` defines base UV density. If a project already exists, Ashfox infers density from current UVs, which keeps updates aligned with prior work.

## Paint discipline that prevents rework

- Use one target and one operation per request.
- Keep each operation semantically meaningful, such as one panel, trim line, or accent patch.
- Omit `target.face` when the same operation should affect all mapped faces of a cube.
- Use `coordSpace: "texture"` only when you intentionally paint in full-texture coordinates with explicit `width` and `height`.

When geometry changes and textures already exist, internal auto-UV and reprojection can run automatically. This is normal and helps preserve painted work while layout changes.

## Cube paint example

```json
{
  "textureName": "pot_tex",
  "target": { "cubeName": "body", "face": "north" },
  "op": { "op": "fill_rect", "x": 0, "y": 0, "width": 16, "height": 16, "color": "#c96f3b" }
}
```

## Mesh paint example

```json
{
  "textureName": "pot_tex",
  "target": { "meshName": "leaf_cluster" },
  "op": { "op": "fill_rect", "x": 0, "y": 0, "width": 8, "height": 8, "color": "#4d7c3f" }
}
```

If paint quality drops after heavy geometry edits, re-run preview first and repaint only areas where visual intent changed.

