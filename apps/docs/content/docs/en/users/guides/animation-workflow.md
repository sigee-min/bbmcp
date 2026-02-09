---
title: "Animation Workflow (Low-level)"
description: "Animation Workflow (Low-level)"
---

# Animation Workflow (Low-level)

Goal: build animations with explicit clips + per-bone keyframes.

Steps:
1) ensure_project / get_project_state (capture revision)
2) create_animation_clip (name, length, loop, fps)
3) set_frame_pose for each frame (multi-bone pose per call)
4) set_trigger_keyframes for sound/particle/timeline (optional)
5) validate / render_preview as needed

Notes:
- Animation tools are low-level only (no high-level pipeline).
- Tool schemas are strict (`additionalProperties: false`); extra fields are rejected.
- Use ifRevision for all mutations.
- set_frame_pose applies one frame at a time, but can include multiple bones.
- Repeat set_frame_pose calls to build a full curve across time.
- Frame values are converted to time using the clip fps (time = frame / fps). If fps is missing, the server defaults to 20.
- delete_animation_clip accepts id/name or ids/names arrays for bulk removal.
- Bones referenced in set_frame_pose must exist in the model.
- bones[].interp overrides the top-level interp for that bone.
- set_trigger_keyframes is one-key-per-call (`keys` max length is 1).
- If you update UVs or geometry, re-render previews for visual checks.

LLM prompt guidance:
- Build a frame plan (frame -> bone pose) and replay it with one set_frame_pose call per frame.
- Keep frames ordered; apply small changes and confirm state between steps.

Example (create clip):
```json
{
  "name": "idle",
  "length": 1.5,
  "loop": true,
  "fps": 20,
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Example (set pose frame, repeat per frame):
```json
{
  "clip": "idle",
  "frame": 0,
  "bones": [
    { "name": "body", "rot": [0, 0, 0] },
    { "name": "neck", "rot": [-5, 0, 0] }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Repeat with another frame:
```json
{
  "clip": "idle",
  "frame": 15,
  "bones": [
    { "name": "body", "rot": [0, 20, 0] },
    { "name": "tail", "rot": [0, 10, 0] }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Set pose frame response shape:
```json
{
  "clip": "idle",
  "clipId": "anim_idle",
  "frame": 15,
  "time": 0.75,
  "bones": 2,
  "channels": 2
}
```

Example (trigger keys):
```json
{
  "clip": "idle",
  "channel": "sound",
  "keys": [
    { "time": 0.5, "value": "my_mod:entity.idle" }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Delete clip example (bulk):
```json
{
  "names": ["idle", "walk", "run"],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Delete response shape:
```json
{
  "id": "idle",
  "name": "idle",
  "deleted": [
    { "id": "idle", "name": "idle" },
    { "id": "walk", "name": "walk" },
    { "id": "run", "name": "run" }
  ]
}
```
