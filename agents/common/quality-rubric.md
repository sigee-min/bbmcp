# ashfox Quality Rubric

Score each category from 0 to 5.
- 0: unusable
- 1: major defects
- 2: noticeable defects
- 3: acceptable baseline
- 4: strong quality
- 5: production-ready

## Categories
1. Form and proportions
- Shape reads correctly at default preview angle.
- Silhouette is intentional and consistent.
- No accidental distortions after mutations.

2. UV layout stability
- No new `uv_overlap` or `uv_scale_mismatch` regressions.
- Face mapping remains coherent after geometry edits.
- Texture space usage is plausible and recoverable.

3. Texture readability and shading
- Main forms are readable at game distance.
- Shading supports depth (not flat/noisy by accident).
- Color contrast is controlled and style-consistent.

4. Animation readability (only if animation changed)
- Key poses are clear at clip speed.
- Motion has no accidental snapping or drift.
- Loop continuity is acceptable for idle/walk cycles.

5. Style consistency
- Matches selected style profile constraints.
- Palette, edge treatment, and shading model are coherent.
- No mixed-style artifacts.

## Pass Threshold
- Minimum per-category score: 3
- Average score target: 4+
- If any category < 3, run one focused improvement pass.

## Reporting Format
- `before`: score map + short rationale
- `after`: score map + delta
- `decision`: accept / iterate / escalate

