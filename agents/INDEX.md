# Agents Package

See `agents/README.md` for install, sync, and usage steps.

## Layout
- `common/`: shared MCP contracts, quality gates, quality rubric, constraint profiles, style profiles, shading ownership rules, and QA report template.
- `codex/skills/`: Codex skill definitions (`SKILL.md` + optional `agents/openai.yaml`).
- `claude/`: Claude playbooks and system prompt templates using the same common rules.
- `scripts/`: helper scripts for syncing and validating agent assets.

## Codex skill
- `ashfox-operator`: single unified skill for safe mutation workflow, craft-quality improvement loops, texture quality gates, and QA-grade bug reporting.

## Shared quality assets
- `common/quality-rubric.md`: scoring model for visual/behavioral output quality.
- `common/constraint-profiles/*.yaml`: declarative structural constraints (symmetry, face layout, foot/toe direction).
- `common/style-profiles/*.md`: style constraints used during craft pass.
- `common/shading-ownership.md`: boundary between skill policy and MCP shading algorithm.

## Quick use
- Windows:
  - Validate: `powershell -ExecutionPolicy Bypass -File agents/scripts/windows/validate-agents.ps1`
  - Sync: `powershell -ExecutionPolicy Bypass -File agents/scripts/windows/sync-codex-skills.ps1`
- macOS/Linux:
  - Validate: `bash agents/scripts/unix/validate-agents.sh`
  - Sync: `bash agents/scripts/unix/sync-codex-skills.sh`

