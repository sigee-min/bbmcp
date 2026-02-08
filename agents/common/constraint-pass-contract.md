# ashfox Constraint Pass Contract

Use this contract when structural correctness matters (symmetry, facial layout, foot/toe direction).

## Required flow
1. Read state and collect current geometry/bone landmarks.
2. Load one or more files from `constraint-profiles/`.
3. Evaluate every enabled rule.
4. If any rule fails, run targeted repair mutations.
5. Re-evaluate until pass or iteration limit.

## Core rule categories
- Mirror symmetry:
  - Left and right landmarks should mirror around a profile-defined midline.
- Facial topology:
  - Eye order, nose centering, mouth placement, and vertical ordering.
- Foot/toe topology:
  - Toe base positions, forward direction alignment, and spacing.

## Evaluation output shape
- `status`: pass | fail
- `ruleResults[]`:
  - `id`
  - `status`
  - `actual`
  - `expected`
  - `delta`
  - `suggestedFix`

## Repair policy
- One mutation per failed rule per iteration.
- Maximum 2 iterations by default.
- If still failing, stop craft edits and return precise failure diagnostics.

