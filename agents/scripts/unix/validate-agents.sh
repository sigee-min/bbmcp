#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SKILLS_ROOT="$REPO_ROOT/agents/codex/skills"
COMMON_ROOT="$REPO_ROOT/agents/common"

if [[ ! -d "$SKILLS_ROOT" ]]; then
  echo "Missing skills root: $SKILLS_ROOT" >&2
  exit 1
fi

failures=0

required_sections=(
  "## Mission"
  "## Safe Pass"
  "## Constraint Pass"
  "## Repair Pass"
  "## Craft Pass"
  "## Shading Ownership"
  "## Quality Rubric"
  "## Style Profiles"
  "## Output Contract"
)

required_tokens=(
  "get_project_state"
  "ifRevision"
  "render_preview"
  "validate"
  "one mutation per tool call"
  "constraint"
  "shade"
)

has_valid_frontmatter() {
  local file="$1"
  awk '
    NR == 1 && $0 != "---" { exit 1 }
    /^name:[[:space:]]*.+$/ { has_name=1 }
    /^description:[[:space:]]*.+$/ { has_desc=1 }
    NR > 1 && $0 == "---" {
      if (has_name && has_desc) exit 0
      exit 1
    }
    END { exit 1 }
  ' "$file"
}

validate_ashfox_operator_refs() {
  local skill_file="$1"
  local skill_dir="$2"
  local refs=(
    "../../../common/mcp-mutation-contract.md"
    "../../../common/texture-quality-gates.md"
    "../../../common/error-recovery-playbook.md"
    "../../../common/qa-report-template.md"
    "../../../common/quality-rubric.md"
    "../../../common/constraint-pass-contract.md"
    "../../../common/shading-ownership.md"
    "../../../common/constraint-profiles/README.md"
    "../../../common/constraint-profiles/humanoid-face.yaml"
    "../../../common/constraint-profiles/biped-foot.yaml"
    "../../../common/style-profiles/minecraft-natural-shade.md"
    "../../../common/style-profiles/creature-organic.md"
    "../../../common/style-profiles/hard-surface-voxel.md"
  )

  for ref in "${refs[@]}"; do
    if ! grep -Fq "$ref" "$skill_file"; then
      echo "Missing required reference '$ref': $skill_file" >&2
      failures=$((failures + 1))
      continue
    fi
    local resolved
    resolved="$(cd "$skill_dir" && realpath "$ref")"
    if [[ ! -f "$resolved" ]]; then
      echo "Referenced file not found '$ref' from $skill_file" >&2
      failures=$((failures + 1))
    fi
  done
}

for skill_dir in "$SKILLS_ROOT"/*; do
  [[ -d "$skill_dir" ]] || continue
  skill_file="$skill_dir/SKILL.md"
  skill_name="$(basename "$skill_dir")"
  if [[ ! -f "$skill_file" ]]; then
    echo "Missing SKILL.md: $skill_dir" >&2
    failures=$((failures + 1))
    continue
  fi
  if ! has_valid_frontmatter "$skill_file"; then
    echo "Invalid frontmatter: $skill_file" >&2
    failures=$((failures + 1))
  fi

  for section in "${required_sections[@]}"; do
    if ! grep -Fq "$section" "$skill_file"; then
      echo "Missing required section '$section': $skill_file" >&2
      failures=$((failures + 1))
    fi
  done

  for token in "${required_tokens[@]}"; do
    if ! grep -Fq "$token" "$skill_file"; then
      echo "Missing required token '$token': $skill_file" >&2
      failures=$((failures + 1))
    fi
  done

  if [[ "$skill_name" == "ashfox-operator" ]]; then
    validate_ashfox_operator_refs "$skill_file" "$skill_dir"
  fi

  if [[ ! -f "$skill_dir/agents/openai.yaml" ]]; then
    echo "Missing agents/openai.yaml: $skill_dir" >&2
    failures=$((failures + 1))
  fi
done

if [[ ! -f "$COMMON_ROOT/quality-rubric.md" ]]; then
  echo "Missing common quality rubric: $COMMON_ROOT/quality-rubric.md" >&2
  failures=$((failures + 1))
fi

if [[ ! -f "$COMMON_ROOT/constraint-pass-contract.md" ]]; then
  echo "Missing constraint pass contract: $COMMON_ROOT/constraint-pass-contract.md" >&2
  failures=$((failures + 1))
fi

if [[ ! -f "$COMMON_ROOT/shading-ownership.md" ]]; then
  echo "Missing shading ownership guide: $COMMON_ROOT/shading-ownership.md" >&2
  failures=$((failures + 1))
fi

if [[ ! -d "$COMMON_ROOT/constraint-profiles" ]]; then
  echo "Missing constraint profile directory: $COMMON_ROOT/constraint-profiles" >&2
  failures=$((failures + 1))
fi

if [[ ! -d "$COMMON_ROOT/style-profiles" ]]; then
  echo "Missing common style profile directory: $COMMON_ROOT/style-profiles" >&2
  failures=$((failures + 1))
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Agent validation failed." >&2
  exit 1
fi

echo "Agent validation ok."

