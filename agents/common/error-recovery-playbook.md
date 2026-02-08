# ashfox Error Recovery Playbook

## `invalid_state_revision_mismatch`
1. Call `get_project_state`.
2. Replace `ifRevision` with latest revision.
3. Retry once.

## `invalid_payload` with schema details
1. Use `details.path` and `details.rule`.
2. Fix payload shape only.
3. Retry same intent with unchanged scope.

## `invalid_state` with UV reasons
Reasons: `uv_overlap`, `uv_scale_mismatch`, `uv_usage_mismatch`.
1. Run `validate`.
2. If needed, run UV recovery path (`autoUvAtlas` where applicable).
3. Repaint using strict single target/face/op.

## Texture integrity anomaly
Signals: sharp byteLength drop, suspicious hash reset, blank preview.
1. Stop further writes.
2. Collect trace and raw request/response.
3. File QA report using template.


