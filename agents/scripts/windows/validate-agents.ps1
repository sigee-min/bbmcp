$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$skillsRoot = Join-Path $repoRoot "agents\codex\skills"
$commonRoot = Join-Path $repoRoot "agents\common"

if (-not (Test-Path $skillsRoot)) {
  throw "Missing skills root: $skillsRoot"
}

$requiredSections = @(
  "## Mission",
  "## Safe Pass",
  "## Constraint Pass",
  "## Repair Pass",
  "## Craft Pass",
  "## Shading Ownership",
  "## Quality Rubric",
  "## Style Profiles",
  "## Output Contract"
)

$requiredTokens = @(
  "get_project_state",
  "ifRevision",
  "render_preview",
  "validate",
  "one mutation per tool call",
  "constraint",
  "shade"
)

$requiredRefsBySkill = @{
  "ashfox-operator" = @(
    "../../../common/mcp-mutation-contract.md",
    "../../../common/texture-quality-gates.md",
    "../../../common/error-recovery-playbook.md",
    "../../../common/qa-report-template.md",
    "../../../common/quality-rubric.md",
    "../../../common/constraint-pass-contract.md",
    "../../../common/shading-ownership.md",
    "../../../common/constraint-profiles/README.md",
    "../../../common/constraint-profiles/humanoid-face.yaml",
    "../../../common/constraint-profiles/biped-foot.yaml",
    "../../../common/style-profiles/minecraft-natural-shade.md",
    "../../../common/style-profiles/creature-organic.md",
    "../../../common/style-profiles/hard-surface-voxel.md"
  )
}

$failures = @()

Get-ChildItem -Path $skillsRoot -Directory | ForEach-Object {
  $skillDir = $_.FullName
  $skillName = $_.Name
  $skillFile = Join-Path $skillDir "SKILL.md"
  if (-not (Test-Path $skillFile)) {
    $failures += "Missing SKILL.md: $skillDir"
    return
  }
  $text = Get-Content -Path $skillFile -Raw
  if ($text -notmatch "(?ms)^---\s*\nname:\s*.+\ndescription:\s*.+\n---") {
    $failures += "Invalid frontmatter: $skillFile"
  }

  foreach ($section in $requiredSections) {
    if ($text -notmatch [regex]::Escape($section)) {
      $failures += "Missing required section '$section': $skillFile"
    }
  }

  foreach ($token in $requiredTokens) {
    if ($text -notmatch [regex]::Escape($token)) {
      $failures += "Missing required token '$token': $skillFile"
    }
  }

  $refs = $requiredRefsBySkill[$skillName]
  if ($refs) {
    foreach ($ref in $refs) {
      if ($text -notmatch [regex]::Escape($ref)) {
        $failures += "Missing required reference '$ref': $skillFile"
        continue
      }
      $resolved = [System.IO.Path]::GetFullPath((Join-Path $skillDir $ref))
      if (-not (Test-Path $resolved)) {
        $failures += "Referenced file not found '$ref' from $skillFile"
      }
    }
  }

  $openaiConfig = Join-Path $skillDir "agents\openai.yaml"
  if (-not (Test-Path $openaiConfig)) {
    $failures += "Missing agents/openai.yaml: $skillDir"
  }
}

if (-not (Test-Path (Join-Path $commonRoot "quality-rubric.md"))) {
  $failures += "Missing common quality rubric: $commonRoot\quality-rubric.md"
}

if (-not (Test-Path (Join-Path $commonRoot "constraint-pass-contract.md"))) {
  $failures += "Missing constraint pass contract: $commonRoot\constraint-pass-contract.md"
}

if (-not (Test-Path (Join-Path $commonRoot "shading-ownership.md"))) {
  $failures += "Missing shading ownership guide: $commonRoot\shading-ownership.md"
}

if (-not (Test-Path (Join-Path $commonRoot "constraint-profiles"))) {
  $failures += "Missing constraint profile directory: $commonRoot\constraint-profiles"
}

if (-not (Test-Path (Join-Path $commonRoot "style-profiles"))) {
  $failures += "Missing common style profile directory: $commonRoot\style-profiles"
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Error $_ }
  throw "Agent validation failed."
}

Write-Host "Agent validation ok."

