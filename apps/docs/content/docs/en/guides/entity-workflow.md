---
title: "Entity Workflow (GeckoLib-targeted)"
description: "Entity Workflow (GeckoLib-targeted)"
---

# Entity Workflow (GeckoLib-targeted)

This guide targets GeckoLib entity projects (`ensure_project.format = "geckolib"`).
Other formats exist, but the rig/animation conventions here assume GeckoLib export semantics.

Recommended steps:
1) ensure_project with format=geckolib (optionally set uvPixelsPerBlock)
2) build bones/cubes with add_bone/add_cube
3) assign textures (assign_texture)
4) paint textures (paint_faces for cubes, paint_mesh_face for meshes)
5) create animations (create_animation_clip + set_frame_pose)
6) add triggers (set_trigger_keyframes) if needed
7) optionally run preview/validate

Notes:
- Modeling is low-level only (add_bone/add_cube).
- UVs are managed internally; no manual UV tools or preflight steps are required.
- Cube add and geometry-changing cube updates trigger internal auto-UV when textures exist.
- Existing texture pixels are reprojected to follow the new UV layout; repaint only if you want a new look.
- Project UV density is controlled by ensure_project.uvPixelsPerBlock (default 16); reused projects infer a median.
- Animation poses are one frame per call; repeat set_frame_pose/set_trigger_keyframes to build timelines.
