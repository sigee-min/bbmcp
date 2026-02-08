# Agents README

This folder contains reusable agent assets for Codex and Claude.

## What is included
- `codex/skills/ashfox-operator/`: the Codex skill package.
- `common/`: shared contracts, quality gates, constraint profiles, and QA templates.
- `claude/`: Claude-oriented prompt/playbook assets.
- `scripts/`: helper scripts for validation and sync.

## Codex install and apply

### 1) Validate assets
- Windows:
  - `powershell -ExecutionPolicy Bypass -File agents/scripts/windows/validate-agents.ps1`
- macOS/Linux:
  - `bash agents/scripts/unix/validate-agents.sh`

### 2) Sync skills into Codex home
- Windows:
  - `powershell -ExecutionPolicy Bypass -File agents/scripts/windows/sync-codex-skills.ps1`
- macOS/Linux:
  - `bash agents/scripts/unix/sync-codex-skills.sh`

Default target is:
- Windows: `%USERPROFILE%\\.codex\\skills`
- macOS/Linux: `$HOME/.codex/skills`

You can override with:
- Windows: `-CodexHome <path>`
- macOS/Linux: `--codex-home <path>`

### 3) Confirm installation
Check that this exists:
- `.../.codex/skills/ashfox-operator/SKILL.md`
- `.../.codex/skills/ashfox-operator/agents/openai.yaml`

### 4) Use the skill in Codex
Reference the skill in your request:
- `Use $ashfox-operator to perform a safe ashfox mutation and run quality gates.`
- `Use $ashfox-operator with humanoid-face and biped-foot constraints, then do one craft pass.`

## Update workflow
1. Edit files in `agents/`.
2. Run validation script.
3. Re-run sync script.
4. Start a new Codex run (or restart your session) and invoke `$ashfox-operator`.

## Notes
- `ashfox-operator` enforces safe mutation flow, constraint pass/repair pass, quality gates, and QA-grade reporting.
- Shading algorithm ownership stays in MCP server logic. The skill only sets policy and verifies outcomes.
- Constraint profiles are in `agents/common/constraint-profiles/`.

