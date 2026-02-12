---
title: "Modeling Workflow"
description: "Guide-first modeling flow for predictable edits and lower rework."
summary: "Guide-first modeling flow for predictable edits and lower rework."
---

# Modeling Workflow

This workflow is designed for teams that want predictable model edits, not one-shot generation. The core idea is to change structure in small units so each mutation can be validated and rolled forward safely.

The most reliable order is to establish project context first, then shape hierarchy, then add geometry, and only after that move into texture and animation work. When this order is reversed, rework usually increases because geometry updates force downstream fixes.

## Recommended flow

1. Run `ensure_project` to attach or create the target project and lock in format assumptions.
2. Create or confirm the bone hierarchy with `add_bone` before adding many cubes.
3. Add geometry iteratively with `add_cube`, one semantic part at a time.
4. Refine with `update_bone` and `update_cube` as proportions stabilize.
5. Use `validate` and `render_preview` as quality gates before moving to export.

The sequence is intentionally incremental. One bone or cube per call keeps revision conflicts and recovery cost low.

## Session bootstrap example

```json
{
  "format": "geckolib",
  "name": "dragon",
  "onMissing": "create",
  "uvPixelsPerBlock": 16
}
```

## Hierarchy-first example

```json
{
  "name": "root",
  "pivot": [0, 0, 0],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

```json
{
  "name": "torso",
  "bone": "root",
  "from": [-4, 0, -2],
  "to": [4, 12, 2],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

## Practical quality rules

- Include `ifRevision` on every mutation to protect against stale writes.
- Keep bone and cube names stable when animation is planned.
- Use bulk delete only when a subtree or set of mirrored parts should be removed together.
- Use mesh tools only on mesh-capable formats such as Generic Model (`free`).

If textures already exist, cube add or geometry-changing cube updates can trigger internal auto-UV. That is expected behavior and usually preferable to manual UV repair.
