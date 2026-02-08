# ashfox MCP Mutation Contract

Use this contract for all mutating ashfox tool calls.

## Required sequence
1. Call `get_project_state` and capture `project.revision`.
2. Execute exactly one mutation with `ifRevision`.
3. Verify response:
   - Success path: revision changes (or explicit `no_change`).
   - Failure path: capture full error payload.
4. Re-read state with `get_project_state` for post-condition checks.

## Mandatory rules
- Always pass `ifRevision` for mutations.
- Keep mutations atomic: one tool call, one intent.
- Do not chain multiple writes without re-reading revision.
- On `invalid_state_revision_mismatch`, fetch new revision and retry once.

## High-risk operations (extra checks)
- `paint_faces`: verify `changedPixels`, `resolvedSource`, texture hash/byteLength.
- `update_cube`/`add_cube`: run `validate`; confirm UV warnings did not regress.
- `set_frame_pose`: verify viewport reflects updates (or call preview for confirmation).


