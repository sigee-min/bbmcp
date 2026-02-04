# Animation Workflow (Low-level)

Goal: build animations with explicit clips + per-bone keyframes.

Steps:
1) ensure_project / get_project_state (capture revision)
2) create_animation_clip (name, length, loop, fps)
3) set_keyframes for each bone + channel (rot/pos/scale), one key per call
4) set_trigger_keyframes for sound/particle/timeline (optional)
5) validate / render_preview as needed

Notes:
- Animation tools are low-level only (no pipeline).
- Use ifRevision for all mutations.
- set_keyframes and set_trigger_keyframes accept exactly one key per call.
- Repeat set_keyframes calls to build a full curve across time.
- delete_animation_clip accepts id/name or ids/names arrays for bulk removal.
- Bones referenced in set_keyframes must exist in the model.
- If you update UVs or geometry, re-render previews for visual checks.

LLM prompt guidance:
- Build a keyframe plan (time/value list) and replay it with one set_keyframes call per entry.
- Keep bone + channel stable while iterating; change only one thing per call.

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

Example (set keyframe, repeat per time sample):
```json
{
  "clip": "idle",
  "bone": "body",
  "channel": "rot",
  "keys": [
    { "time": 0.0, "value": [0, 0, 0] }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Repeat with another time:
```json
{
  "clip": "idle",
  "bone": "body",
  "channel": "rot",
  "keys": [
    { "time": 0.75, "value": [0, 20, 0] }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
```

Set keyframes response shape:
```json
{
  "clip": "idle",
  "clipId": "anim_idle",
  "bone": "body"
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
