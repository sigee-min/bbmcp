# ashfox Texture Quality Gates

Apply these checks after `paint_faces`.

## Gate A: Write sanity
- `opsApplied` is `1`.
- `targets` is `1`.
- `changedPixels` is greater than `0` when a visible change is expected.

## Gate B: Coordinate sanity
- Inspect `resolvedSource.coordSpace`.
- For default workflow, expect `coordSpace=face`.
- Ensure `resolvedSource.width/height` match intended face-local source scale.

## Gate C: Integrity sanity
- Call `validate`; ensure no new `uv_overlap` or `uv_scale_mismatch`.
- Call `read_texture`; ensure byteLength/content hash are plausible.
- If byteLength collapses unexpectedly, stop and report.

## Gate D: Visual sanity
- Render preview and inspect target face.
- If mismatch:
  1. Re-check revision chain.
  2. Re-run single paint with explicit color and coordinates.
  3. Capture request/response and trace entries.


