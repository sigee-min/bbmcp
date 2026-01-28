import { ResourceContent, ResourceTemplate } from '../ports/resources';

export const GUIDE_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'bbmcp://guide/{name}',
    name: 'Guide',
    mimeType: 'text/markdown',
    description: 'Static guides and examples for bbmcp workflows.'
  }
];

export const GUIDE_RESOURCES: ResourceContent[] = [
  {
    uri: 'bbmcp://guide/modeling-workflow',
    name: 'Modeling Workflow Guide',
    mimeType: 'text/markdown',
    description: 'High-level model_pipeline workflow and ModelSpec basics.',
    text: `# Modeling Workflow (ModelSpec)

Goal: define the desired model state and let model_pipeline plan/apply the changes.

Steps:
1) ensure_project (optional)
2) model_pipeline with desired bones/cubes
3) validate (optional) or preview (optional)
4) export (optional)

Minimal example:
\`\`\`json
{
  "model": {
    "rigTemplate": "empty",
    "bones": [
      { "id": "root", "pivot": [0,0,0] },
      { "id": "body", "parentId": "root", "pivot": [0,6,0] }
    ],
    "cubes": [
      { "id": "body", "parentId": "body", "from": [-4,0,-2], "to": [4,12,2] }
    ]
  },
  "mode": "replace",
  "preview": { "mode": "fixed", "output": "single", "angle": [30,45,0] },
  "validate": true,
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
\`\`\`

Notes:
- For stable edits, always use ids. If ids are omitted, the default idPolicy=stable_path derives ids from hierarchy/name; set idPolicy=explicit to enforce strict ids.
- Use mode=merge to add/update without deleting; mode=replace to match the desired state.
- deleteOrphans removes bones/cubes not in the spec (defaults to true when mode=replace).
- planOnly returns the plan without applying changes.
- Mutations require ifRevision; planOnly is read-only and can omit it.
- planOnly cannot be combined with ensureProject/preview/validate/export.
- Instances (mirror/repeat/radial) expand into cubes before applying.
- Anchors let you reuse positions. Use pivotAnchorId on bones and centerAnchorId/originAnchorId on cubes.
`
  },
  {
    uri: 'bbmcp://guide/rigging',
    name: 'Rigging Guide',
    mimeType: 'text/markdown',
    description: 'Root-based bone hierarchy guidelines for animation-ready rigs.',
    text: `# Rigging Guide (Animation-Ready)

Use a root-based hierarchy so animation transforms propagate predictably.

Guidelines:
- Always include a root bone named "root".
- Every non-root part must set parent to an existing bone.
- Avoid flat bone lists (no parents). Use a tree: root -> body -> head/limbs.
- Prefer model_pipeline for all modeling edits.

Example (model_pipeline):
\`\`\`json
{
  "model": {
    "rigTemplate": "empty",
    "bones": [
      { "id": "root", "pivot": [0, 0, 0] },
      { "id": "body", "parentId": "root", "pivot": [0, 6, 0] },
      { "id": "head", "parentId": "body", "pivot": [0, 12, 0] },
      { "id": "left_arm", "parentId": "body", "pivot": [4, 12, 0] },
      { "id": "right_arm", "parentId": "body", "pivot": [-4, 12, 0] }
    ],
    "cubes": [
      { "id": "body", "parentId": "body", "from": [-4, 0, -2], "to": [4, 12, 2] }
    ]
  },
  "mode": "merge"
}
\`\`\`

Common failures and fixes:
- "Parent bone not found": ensure the parent part exists and that every non-root part sets a valid parent id. If unsure, rebuild the hierarchy using model_pipeline (mode=replace).
- "invalid_state_revision_mismatch": call get_project_state and retry with the latest ifRevision.
`
  },
  {
    uri: 'bbmcp://guide/texture-workflow',
    name: 'Texture Workflow Guide',
    mimeType: 'text/markdown',
    description: 'UV-first texture workflow with uvPaint and presets.',
text: `# Texture Workflow (UV-first)

Goal: paint only within UV rects so patterns scale correctly.

Note: If low-level tools are not exposed, use texture_pipeline to run the whole flow.

Steps:
1) ensure_project / get_project_state (capture revision)
2) assign_texture (bind texture to cubes)
3) preflight_texture (get uvUsageId + mapping)
4) apply_uv_spec (high-level UV updates) OR set_face_uv (low-level)
5) preflight_texture again (UVs changed ??new uvUsageId)
6) apply_texture_spec or generate_texture_preset using uvUsageId
7) render_preview to validate

Notes:
- uvPaint is enforced; only UV rects are painted.
- Call preflight_texture without texture filters for a stable uvUsageId.
- If UVs change, preflight again and repaint.
- For >=64px textures, use generate_texture_preset.

Example (generate_texture_preset):
\`\`\`json
{
  "preset": "wood",
  "name": "pot_wood",
  "width": 64,
  "height": 64,
  "uvUsageId": { "$ref": { "kind": "tool", "tool": "preflight_texture", "pointer": "/uvUsageId" } },
  "mode": "create"
}
\`\`\`

Example (preflight_texture):
\`\`\`json
{
  "includeUsage": true
}
\`\`\`

Example (apply_uv_spec):
\`\`\`json
{
  "uvUsageId": { "$ref": { "kind": "tool", "tool": "preflight_texture", "pointer": "/uvUsageId" } },
  "assignments": [
    {
      "cubeName": "body",
      "faces": {
        "north": [0, 0, 8, 12],
        "south": [8, 0, 16, 12]
      }
    }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
\`\`\`

Example (apply_texture_spec, minimal create):
\`\`\`json
{
  "uvUsageId": { "$ref": { "kind": "tool", "tool": "preflight_texture", "pointer": "/uvUsageId" } },
  "textures": [
    {
      "mode": "create",
      "name": "pot_wood",
      "width": 64,
      "height": 64,
      "background": "#00000000",
      "uvPaint": { "scope": "rects", "mapping": "stretch" },
      "ops": []
    }
  ],
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
\`\`\`

Example (texture_pipeline, minimal):
\`\`\`json
{
  "preflight": { "includeUsage": false },
  "textures": [
    { "mode": "create", "name": "pot_wood", "width": 64, "height": 64, "background": "#00000000" }
  ],
  "preview": { "mode": "fixed", "output": "single", "angle": [30, 45, 0] },
  "ifRevision": { "$ref": { "kind": "tool", "tool": "get_project_state", "pointer": "/project/revision" } }
}
\`\`\`
`
  },
  {
    uri: 'bbmcp://guide/uv-atlas',
    name: 'UV Atlas Guide',
    mimeType: 'text/markdown',
    description: 'Auto atlas packing and resolution growth strategy.',
text: `# UV Atlas Guide

Use auto_uv_atlas when UVs overlap or there is not enough space.

Note: auto_uv_atlas is available only when low-level tools are exposed. Otherwise rely on texture_pipeline with autoRecover=true.

Key points:
- Only identical rects may overlap.
- auto_uv_atlas groups by texture + face size.
- When packing overflows, resolution doubles and packing retries.
- Rect sizes are computed from the starting resolution; increasing size adds space instead of scaling UVs.

Example (plan only):
\`\`\`json
{
  "apply": false
}
\`\`\`

Example (apply):
\`\`\`json
{
  "apply": true
}
\`\`\`

After apply:
- Call preflight_texture again.
- Repaint textures using the new mapping.
`
  },
  {
    uri: 'bbmcp://guide/texture-spec',
    name: 'Texture + UV Spec',
    mimeType: 'text/markdown',
    description: 'Canonical UV and texturing invariants.',
    text: `# Texture + UV Spec (Summary)

Core rules:
1) Manual per-face UVs only.
2) Paint only inside UV rects (uvPaint enforced).
3) UV overlaps are errors unless identical.
4) UV scale mismatch is an error.

Workflow:
- assign_texture
- preflight_texture (uvUsageId)
- apply_uv_spec (or set_face_uv)
- preflight_texture again
- apply_texture_spec / generate_texture_preset
- auto_uv_atlas when UVs are crowded

Notes:
- preflight_texture computes uvUsageId; required by apply_uv_spec/apply_texture_spec/generate_texture_preset.
- validate reports uv_overlap/uv_scale_mismatch; mutation guards return invalid_state on overlap/scale/usage mismatch.

See full spec in docs/texture-uv-spec.md.
`
  },
  {
    uri: 'bbmcp://guide/llm-texture-strategy',
    name: 'LLM Texture Strategy',
    mimeType: 'text/markdown',
    description: 'LLM-oriented workflow and recovery loop.',
text: `# LLM Texture Strategy (Summary)

Note: If low-level tools are hidden, use texture_pipeline for the full workflow.

Primary flow:
1) assign_texture
2) preflight_texture
3) apply_uv_spec (or set_face_uv)
4) preflight_texture again
5) apply_texture_spec / generate_texture_preset
6) render_preview

Recovery loop:
- validate reports uv_scale_mismatch / uv_overlap, or a mutation returns invalid_state about overlap/scale/uvUsageId:
??auto_uv_atlas (apply=true)
??preflight_texture
??repaint

Tip: apply_texture_spec and texture_pipeline support autoRecover=true to run the recovery loop once automatically.
Tip: texture_pipeline can run the full workflow (assign ??preflight ??uv ??paint ??preview) in one call.

Failure examples:

1) uvUsageId mismatch (invalid_state):
- Call preflight_texture WITHOUT texture filters.
- Retry apply_uv_spec/apply_texture_spec with the new uvUsageId.

2) UV overlap / UV scale mismatch (invalid_state):
- Run auto_uv_atlas (apply=true).
- Call preflight_texture again.
- Repaint using the refreshed mapping.

See full guide in docs/llm-texture-strategy.md.
`
  },
  {
    uri: 'bbmcp://guide/vision-fallback',
    name: 'Vision Fallback Guide',
    mimeType: 'text/markdown',
    description: 'Preview/texture image snapshot workflow for manual uploads.',
    text: `# Vision Fallback (Preview + Texture)

Primary: use render_preview and (if exposed) read_texture so the client can attach images directly.

Fallback: if the client cannot accept images, save snapshots to disk and upload manually.

Preview (auto + fallback):
\`\`\`json
{
  "mode": "fixed",
  "output": "single",
  "angle": [30, 45, 0],
  "saveToTmp": true,
  "tmpPrefix": "preview"
}
\`\`\`

Texture (auto + fallback):
\`\`\`json
{
  "name": "pot_wood",
  "saveToTmp": true,
  "tmpPrefix": "texture"
}
\`\`\`

Snapshots are saved under:
- <project_root>/.bbmcp/tmp

Cleanup:
- Delete files immediately after manual upload to avoid stale/large tmp files.
`
  },
  {
    uri: 'bbmcp://guide/entity-workflow',
    name: 'Entity Workflow Guide',
    mimeType: 'text/markdown',
    description: 'GeckoLib-first entity workflow with version targeting.',
    text: `# Entity Workflow (GeckoLib-first)

This workflow prioritizes GeckoLib; Modded/OptiFine formats are not covered yet.

Recommended steps:
1) entity_pipeline with format=geckolib (targetVersion v3/v4)
2) include model bones/cubes (root-based hierarchy)
3) include textures + uvUsageId if painting
4) include animations (clips + keyframes)
5) add triggers (sound/particle/timeline) if needed

Example:
\`\`\`json
{
  "format": "geckolib",
  "targetVersion": "v4",
  "ensureProject": { "name": "my_entity", "match": "format", "onMissing": "create" },
  "model": {
    "rigTemplate": "empty",
    "bones": [
      { "id": "root", "pivot": [0, 0, 0] },
      { "id": "body", "parentId": "root", "pivot": [0, 6, 0] }
    ],
    "cubes": [
      { "id": "body", "parentId": "body", "from": [-4, 0, -2], "to": [4, 12, 2] }
    ]
  },
  "textures": [],
  "animations": [
    {
      "name": "idle",
      "length": 1.5,
      "loop": true,
      "fps": 20,
      "channels": [
        {
          "bone": "body",
          "channel": "rot",
          "keys": [{ "time": 0, "value": [0, 0, 0] }]
        }
      ],
      "triggers": [
        { "type": "sound", "keys": [{ "time": 0.5, "value": "my_mod:entity.idle" }] }
      ]
    }
  ]
}
\`\`\`
`
  }
];







