export const RIGGING_WORKFLOW_INSTRUCTIONS = [
  'For animation-ready rigs, always include a root bone named "root".',
  'Every non-root part must set parent to an existing part id (no flat bone lists).',
  'Prefer model_pipeline for modeling edits.',
  'For GeckoLib entities, prefer entity_pipeline for model + textures + animations.',
  'Prefer stable ids; renaming ids can break animation channels.',
  'If ids are omitted, model_pipeline derives stable_path ids from hierarchy/name. Set model.policies.idPolicy=explicit to require ids.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  'If unsure about hierarchy rules, read bbmcp://guide/rigging via resources/read.',
  'For high-level modeling, read bbmcp://guide/modeling-workflow via resources/read.'
].join(' ');

export const TEXTURE_WORKFLOW_INSTRUCTIONS = [
  'This server may expose only high-level tools by default. If low-level tools are hidden, use texture_pipeline for the entire workflow. Enable "Expose Low-Level Tools" for direct access.',
  'Prefer the macro tool: texture_pipeline. Use autoRecover=true when UV overlap/scale or uvUsageId mismatch occurs.',
  'Before painting, lock invariants: project textureResolution, manual per-face UV policy, and intended texture count (single atlas vs per-material).',
  'If preflight_texture is available: call it without texture filters to get a stable uvUsageId and UV mapping.',
  'Paint only inside UV rects (uvPaint enforced). Whole-texture painting is not supported; map UVs to the full texture if you need full coverage.',
  'uvUsageId is a guard. If any UVs change, call preflight_texture again and repaint. If you hit invalid_state due to UV usage mismatch, refresh preflight and retry with the new uvUsageId.',
  'UV overlaps are errors unless the rects are identical. UV scale mismatches are errors. Recovery loop: auto_uv_atlas(apply=true) -> preflight_texture -> repaint.',
  'Payload sizing: for <=32px textures, small ops are fine; for 64px+ prefer procedural presets to avoid large payloads.',
  'Texture creation does not bind textures to cubes. Ensure textures are assigned in the same workflow (texture_pipeline assign step) so they are visible.',
  'For visual verification, use render_preview. If images cannot be attached, set saveToTmp=true and read bbmcp://guide/vision-fallback via resources/read.',
  'If unsure about the workflow or recovery, read bbmcp://guide/llm-texture-strategy via resources/read.'
].join(' ');

export const SERVER_TOOL_INSTRUCTIONS = [
  'Tool paths can be session-bound (e.g., /bbmcp/link_...).',
  'toolRegistry.hash is the authoritative schema change signal; toolSchemaVersion is coarse.',
  'Tool schemas are strict (extra fields are rejected).',
  'Use get_project_state (or includeState/includeDiff) before and after edits.',
  'Prefer high-level pipelines: model_pipeline, texture_pipeline, entity_pipeline, block_pipeline.',
  'Prefer ensure_project to create or reuse projects; use match/onMismatch/onMissing to control when a fresh project is created.',
  'When confirmDialog=true on ensure_project, always provide ensure_project.dialog values for required fields (e.g., format, parent). Missing fields will cause the call to fail with a required-field list.',
  'Use block_pipeline to generate blockstate/model/item JSON resources.',
  'Prefer id fields when updating or deleting items.',
  'Pass ifRevision on mutations to guard against stale state.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  RIGGING_WORKFLOW_INSTRUCTIONS,
  TEXTURE_WORKFLOW_INSTRUCTIONS
].join(' ');

export const SIDECAR_TOOL_INSTRUCTIONS = [
  'Use get_project_state (or includeState/includeDiff) before mutations and include ifRevision.',
  'toolRegistry.hash is the authoritative schema change signal; toolSchemaVersion is coarse.',
  'Prefer high-level pipelines: model_pipeline, texture_pipeline, entity_pipeline, block_pipeline.',
  'Prefer ensure_project to create or reuse projects; use match/onMismatch/onMissing to control when a fresh project is created.',
  'When confirmDialog=true on ensure_project, always provide ensure_project.dialog values for required fields (e.g., format, parent). Missing fields will cause the call to fail with a required-field list.',
  'Use block_pipeline to generate blockstate/model/item JSON resources.',
  'Prefer id-based updates.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  RIGGING_WORKFLOW_INSTRUCTIONS,
  TEXTURE_WORKFLOW_INSTRUCTIONS
].join(' ');


