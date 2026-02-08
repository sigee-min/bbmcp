# Texture Workflow (Auto UV)

Goal: paint textures without managing UVs manually.

Steps:
1) ensure_project / get_project_state (capture revision)
2) assign_texture (bind texture to cubes)
3) paint_faces (cubes) or paint_mesh_face (meshes)
4) render_preview to validate

Notes:
- UVs are managed internally; UV tools are not exposed to clients.
- `ensure_project.uvPixelsPerBlock` sets the per-face UV density (default 16).
- When reusing an existing project, ashfox infers UV density from existing UVs using the median face density.
- ensure_project auto-creates a texture named after the project when none exists.
- Cube add and geometry-changing cube updates trigger internal UV atlas when textures exist.
- Existing pixels are reprojected to the new UV layout automatically.
- paint_faces may return a recovery summary when auto-UV fixes were applied.
- paint_faces is strict single-write: exactly one `target` (`cubeId`/`cubeName`, optional `face`) and one `op`.
- paint_faces schema is strict; `targets`, `ops`, and `background` are invalid payload fields.
- Omit `target.face` to paint all mapped faces of the target cube.
- paint_mesh_face is strict single-op with one mesh target (`meshId`/`meshName`) and one `op`.
- paint_mesh_face is available only when the active format supports meshes.
- paint_mesh_face `scope` can be `single_face` or `all_faces`. If omitted, scope is inferred:
  - `target.faceId` present -> `single_face`
  - `target.faceId` absent -> `all_faces`
- In `single_face`, `target.faceId` is required. In `all_faces`, `target.faceId` must be omitted.
- `fill_rect` shading is on by default for deterministic tonal variation; use `shade: false` to keep flat color.
- Advanced shading uses `shade` object fields: `enabled`, `intensity`, `edge`, `noise`, `seed`, `lightDir`.
- Default `coordSpace` is `face`; if `width/height` is omitted, source size follows the target face UV size.
- Use `coordSpace: "texture"` only for texture-space coordinates; this requires explicit `width`/`height` matching texture size.
- For >=64px textures, keep ops minimal and use tiling patterns.
- When specifying both cubeId and cubeName in target, both must match. Use only one to avoid overly narrow matches.
- Support limit: models that still exceed atlas capacity after auto density reduction are not supported.
- paint_mesh_face applies a commit guard: if the committed texture becomes unsafe (for example fully transparent collapse or no committed delta after expected change), ashfox automatically rolls back and returns an error.

Example (paint_faces):
```json
{
  "textureName": "pot_tex",
  "target": { "cubeName": "body", "face": "north" },
  "op": { "op": "fill_rect", "x": 0, "y": 0, "width": 16, "height": 16, "color": "#c96f3b" }
}
```

Example (paint_mesh_face, inferred `all_faces`):
```json
{
  "textureName": "pot_tex",
  "target": { "meshName": "leaf_cluster" },
  "op": { "op": "fill_rect", "x": 0, "y": 0, "width": 8, "height": 8, "color": "#4d7c3f" }
}
```

Failure example (invalid multi-write payload):
```json
{
  "textureName": "pot_tex",
  "targets": [{ "cubeName": "body", "faces": ["north", "south"] }],
  "ops": [
    { "op": "fill_rect", "x": 0, "y": 0, "width": 16, "height": 16, "color": "#c96f3b" },
    { "op": "fill_rect", "x": 2, "y": 2, "width": 2, "height": 2, "color": "#8b4a22" }
  ]
}
```

