# Rigging Guide (Animation-Ready)

Use a root-based hierarchy so animation transforms propagate predictably.

Guidelines:
- Ensure a root bone exists (add_bone, or rely on cube auto-root if using add_cube).
- Every non-root part must set parent to an existing bone.
- Avoid flat bone lists (no parents). Use a tree: root -> body -> head/limbs.
- Use add_bone one at a time to build the hierarchy.

Example (low-level calls, one bone per request):
```json
{ "name": "root", "pivot": [0, 0, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```
```json
{ "name": "body", "parent": "root", "pivot": [0, 6, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```
```json
{ "name": "head", "parent": "body", "pivot": [0, 12, 0], "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } } }
```

Common failures and fixes:
- "Parent bone not found": create the parent first, then retry the child.
- "invalid_state_revision_mismatch": call get_project_state and retry with the latest ifRevision.
