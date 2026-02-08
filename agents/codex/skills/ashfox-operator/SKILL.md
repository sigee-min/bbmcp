---
name: ashfox-operator
description: Operate ashfox MCP tools with high reliability for modeling, texturing, animation, validation, and QA reporting. Use when creating or editing Blockbench projects through ashfox, when diagnosing failed mutations, or when generating developer-ready defect reports with full request/response history.
---

# ashfox Operator

## Mission
Run ashfox edits safely, then optimize for visual and behavioral quality with a short, deterministic improvement loop.

## Safe Pass
Use strict mutation discipline before any quality tuning.
1. Call `get_project_state` and capture `project.revision`.
2. Execute exactly one mutation with `ifRevision`.
3. Validate mutation response and revision transition.
4. Re-read state and verify post-conditions.

Rules:
- Always use one mutation per tool call.
- Always pass `ifRevision` for mutations.
- Retry once only for `invalid_state_revision_mismatch` after refreshing revision.
- Never retry `invalid_payload` without correcting payload.

## Constraint Pass
Before craft tuning, enforce structural constraints using profile-based rules.
1. Load one or more profiles from `../../../common/constraint-profiles/`.
2. Resolve landmark mapping (face and foot/toe targets) from current snapshot names/ids.
3. Evaluate constraints and produce pass/fail with per-rule diagnostics.
4. If failed, execute `Repair Pass` before any style-level edits.

Hard requirements:
- Prefer bilateral symmetry where profile requires it.
- For face targets, check relative ordering and spacing for eyes, nose, and mouth.
- For feet/toes, check position, direction alignment, and ground-contact coherence.

## Repair Pass
Use minimal, deterministic corrections for failed constraints.
1. Apply one focused mutation per failed rule.
2. Re-evaluate constraints.
3. Stop after 2 repair iterations unless user explicitly asks for more.

If constraints remain failing after limit:
- Stop further aesthetic edits.
- Return failure summary with exact violated rules and current measurements.

## Craft Pass
After the mutation is safe, improve output quality.
1. Select one style profile from `../../../common/style-profiles/`.
2. Render with `render_preview`.
3. Score current result with `../../../common/quality-rubric.md`.
4. Apply one focused improvement mutation.
5. Re-render and re-score.

Limits:
- Maximum 2 craft iterations per request unless explicitly asked for more.
- Stop immediately if integrity checks fail.

## Shading Ownership
Shading generation belongs to MCP server logic, not this skill.
- Do not duplicate or re-implement shading algorithms in the skill.
- The skill controls only policy and verification:
  - choose style profile and shade intent,
  - request server-side shading behavior,
  - verify visual outcome with rubric and preview.
- If shading quality is poor, adjust inputs/parameters and re-run.
- If behavior seems wrong, report as server issue with evidence.

## Quality Rubric
Use `../../../common/quality-rubric.md` and report scores for:
- Form and proportions
- UV layout stability
- Texture readability and shading
- Animation readability (if animation is touched)
- Consistency with selected style profile

## Style Profiles
Pick one explicit style target and keep it stable for the whole run:
- `../../../common/style-profiles/minecraft-natural-shade.md`
- `../../../common/style-profiles/creature-organic.md`
- `../../../common/style-profiles/hard-surface-voxel.md`

## Output Contract
Always include:
- Mutation sequence with revision chain
- Quality gate outcomes (`validate`, `read_texture`, preview checks)
- Rubric scores before/after craft pass
- Remaining risks and next best improvement

When behavior is wrong or unstable, produce a QA report:
- Include verbatim request/response JSON history.
- Include revision chain and environment versions.
- Include trace paths and evidence.
- Separate observed facts from hypotheses.

Load detailed references as needed:
- `../../../common/mcp-mutation-contract.md`
- `../../../common/texture-quality-gates.md`
- `../../../common/error-recovery-playbook.md`
- `../../../common/qa-report-template.md`
- `../../../common/quality-rubric.md`
- `../../../common/constraint-pass-contract.md`
- `../../../common/shading-ownership.md`
- `../../../common/constraint-profiles/README.md`
- `../../../common/constraint-profiles/humanoid-face.yaml`
- `../../../common/constraint-profiles/biped-foot.yaml`

