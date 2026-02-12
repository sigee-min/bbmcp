---
title: "Entity Workflow"
description: "End-to-end guide for GeckoLib-targeted entity production."
summary: "End-to-end guide for GeckoLib-targeted entity production."
---

# Entity Workflow

This guide describes a full entity production loop for GeckoLib-oriented projects where format behavior, rig conventions, and animation export expectations must stay aligned.

Use this flow when the deliverable is an animated entity asset, not an isolated model fragment. The objective is to avoid late-stage format surprises by validating each stage in order.

## Recommended sequence

1. Start the project with `ensure_project` and set `format` to `geckolib`.
2. Build hierarchy and geometry with `add_bone` and `add_cube`.
3. Attach and paint textures with `assign_texture`, `paint_faces`, and `paint_mesh_face` where relevant.
4. Create clips and timeline data with `create_animation_clip`, `set_frame_pose`, and optional trigger keys.
5. Run `render_preview` and `validate` before final export.

The sequence matters. If you animate before geometry and texture intent is stable, retiming and repainting costs rise quickly.

## Format-aware notes

- UV behavior is handled internally, including auto-UV and reprojection during geometry changes.
- `uvPixelsPerBlock` controls the base density and should be chosen early for consistency.
- Pose and trigger data are authored incrementally, one frame or one trigger key at a time.

When used as a pipeline, this workflow keeps authoring, review, and export behavior predictable for both human and automated clients.
