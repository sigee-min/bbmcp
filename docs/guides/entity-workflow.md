# Entity Workflow (GeckoLib-only)

Only GeckoLib is supported.

Recommended steps:
1) ensure_project with format=geckolib
2) build bones/cubes with add_bone/add_cube
3) assign textures + UVs (assign_texture -> preflight_texture -> set_face_uv)
4) paint textures (generate_texture_preset)
5) create animations (create_animation_clip + set_keyframes)
6) add triggers (set_trigger_keyframes) if needed
7) optionally run preview/validate

Notes:
- Modeling is low-level only (add_bone/add_cube).
- UVs are explicit per face; always preflight to get a fresh uvUsageId before painting.
- Animation keyframes are one key per call; repeat set_keyframes/set_trigger_keyframes to build timelines.
