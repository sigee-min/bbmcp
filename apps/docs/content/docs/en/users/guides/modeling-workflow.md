---
title: "Modeling Workflow (Low-level)"
description: "Modeling Workflow (Low-level)"
---

# Modeling Workflow (Low-level)

Goal: build the model one bone/cube at a time for better control and lower LLM cost.

Steps:
1) ensure_project (optional)
2) add_bone (optional) to define hierarchy
3) add_cube (one cube per call)
4) update_cube / update_bone as needed
5) validate or render_preview
6) export (optional)

Project setup example (with UV density):
```json
{
  "format": "geckolib",
  "name": "dragon",
  "onMissing": "create",
  "uvPixelsPerBlock": 16
}
```

Minimal example (cube only, root auto-created):
```json
{
  "name": "body",
  "from": [4, 0, 4],
  "to": [12, 10, 12],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Skeleton-first example:
```json
{
  "name": "root",
  "pivot": [0, 0, 0],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Then add a cube under that bone:
```json
{
  "name": "torso",
  "bone": "root",
  "from": [-4, 0, -2],
  "to": [4, 12, 2],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Bulk delete example (ids/names arrays):
```json
{
  "names": ["arm_l", "arm_r", "leg_l", "leg_r"],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Delete response shape:
```json
{
  "id": "arm_l",
  "name": "arm_l",
  "removedBones": 4,
  "removedCubes": 6,
  "deleted": [
    { "id": "arm_l", "name": "arm_l" },
    { "id": "arm_r", "name": "arm_r" },
    { "id": "leg_l", "name": "leg_l" },
    { "id": "leg_r", "name": "leg_r" }
  ]
}
```

Notes:
- One bone/cube per call. This is intentional for quality and stability.
- If cube bone is omitted, the server auto-creates/uses a root bone.
- Always include ifRevision for mutations.
- Mesh tools (`add_mesh`, `update_mesh`, `delete_mesh`) are enabled only on mesh-capable formats (for example `Generic Model` / `free`).
- Use update_bone/update_cube for edits; delete_bone/delete_cube accept id/name or ids/names arrays for bulk removal.
- delete_bone reports all removed bones (including descendants) in `deleted`.
- If textures already exist, cube add or geometry-changing update (`from`/`to`/`inflate`) can trigger internal auto-UV.
- Keep ids stable if you plan to animate.
- `validate` now includes mesh topology checks (duplicate vertex ids, unknown face vertex refs, degenerate faces, invalid UV refs).
- `get_project_state` and diff metadata include mesh counters (`meshes`, `meshVertices`, `meshFaces`) for QA tracking.

LLM prompt guidance:
- Generate a small checklist (bone/cube names) and add them one at a time.
- After each add/update, call get_project_state and verify the last change.
- Never send multiple bones/cubes in a single request; rely on iteration instead.
