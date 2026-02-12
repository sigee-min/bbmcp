---
title: "Animation Workflow"
description: "Guide-first clip and keyframe workflow for deterministic animation results."
summary: "Guide-first clip and keyframe workflow for deterministic animation results."
---

# Animation Workflow

Animation in Ashfox is intentionally explicit. You define clips and place keyframes directly, which gives strong control and reproducibility for both manual and LLM-driven pipelines.

The workflow works best when you separate three concerns: clip definition, pose timeline, and trigger timeline. Keeping these concerns separate makes debugging easier when timing or interpolation looks wrong.

## Recommended flow

1. Read project revision and confirm the target model.
2. Create the clip with clear duration, loop mode, and fps.
3. Apply pose frames in chronological order with `set_frame_pose`.
4. Add sound/particle/timeline triggers with `set_trigger_keyframes` only after pose timing is stable.
5. Validate with preview renders before export.

Frame numbers are converted to time using clip fps, so consistent fps selection at clip creation matters for every downstream edit.

## Clip creation example

```json
{
  "name": "idle",
  "length": 1.5,
  "loop": true,
  "fps": 20,
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

## Pose frame example

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

## Trigger example

```json
{
  "clip": "idle",
  "channel": "sound",
  "keys": [{ "time": 0.5, "value": "my_mod:entity.idle" }],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

## Quality rules

- Keep `ifRevision` on every animation mutation.
- Ensure referenced bones already exist.
- Build curves by repeating frame-level calls in ordered time.
- Re-render preview whenever geometry, UV layout, or key timing changes.
