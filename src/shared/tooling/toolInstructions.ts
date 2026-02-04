export const RIGGING_WORKFLOW_INSTRUCTIONS = [
  'For animation-ready rigs, ensure a root bone exists (explicit for most formats).',
  'Every non-root part must set parent to an existing part id (no flat bone lists).',
  'Modeling is low-level only: use add_bone/add_cube with one item per call.',
  'If cube bone is omitted, the server auto-creates/uses a root bone.',
  'Prefer stable ids; renaming ids can break animation channels.',
  'LLM guidance: iterate step-by-step and re-check get_project_state after each add/update.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  'If unsure about hierarchy rules, read bbmcp://guide/rigging via resources/read.',
  'For low-level modeling steps, read bbmcp://guide/modeling-workflow via resources/read.'
].join(' ');

export const TEXTURE_WORKFLOW_INSTRUCTIONS = [
  'Textures are low-level only: assign_texture -> preflight_texture -> set_face_uv (as needed) -> generate_texture_preset.',
  'Before painting, lock invariants: project textureResolution and manual per-face UV policy.',
  'If preflight_texture is available: call it without texture filters to get a stable uvUsageId and UV mapping.',
  'Paint only inside UV rects (uvPaint enforced). Whole-texture painting is not supported; map UVs to the full texture if you need full coverage.',
  'uvUsageId is a guard. If any UVs change, call preflight_texture again and repaint. If you hit invalid_state due to UV usage mismatch, refresh preflight and retry with the new uvUsageId.',
  'UV overlaps are errors unless the rects are identical. UV scale mismatches are errors. Recovery: run auto_uv_atlas (apply=true), then preflight_texture again.',
  'Payload sizing: for <=32px textures, small ops are fine; for 64px+ prefer procedural presets to avoid large payloads.',
  'Texture creation does not bind textures to cubes. Ensure textures are assigned via assign_texture.',
  'For visual verification, use render_preview. If images cannot be attached, set saveToTmp=true and read bbmcp://guide/vision-fallback via resources/read.',
  'If unsure about the workflow or recovery, read bbmcp://guide/llm-texture-strategy via resources/read.'
].join(' ');

export const SERVER_TOOL_INSTRUCTIONS = [
  'Tool paths can be session-bound (e.g., /bbmcp/link_...).',
  'toolRegistry.hash is the authoritative schema change signal; toolSchemaVersion is coarse.',
  'Tool schemas are strict (extra fields are rejected).',
  'Use get_project_state (or includeState/includeDiff) before and after edits.',
  'Modeling is low-level only: add_bone/add_cube.',
  'Animations are low-level only: create_animation_clip -> set_keyframes -> set_trigger_keyframes.',
  'Animation keys are one-per-call: set_keyframes and set_trigger_keyframes accept exactly one key.',
  'LLM guidance: avoid batching; use small iterative edits and confirm state between steps.',
  'Textures are low-level only: assign_texture -> preflight_texture -> set_face_uv (as needed) -> generate_texture_preset.',
  'Prefer ensure_project to create or reuse projects; use match/onMismatch/onMissing to control when a fresh project is created.',
  'ensure_project supports action="delete" to close the active project. Provide target.name to match the open project; set force=true to discard unsaved changes (no auto-save).',
  'ensure_project auto-confirms the Blockbench project dialog. Provide ensure_project.dialog values for required fields (e.g., format, parent) so creation can proceed without UI input.',
  'For Java Block/Item creation, the server auto-fills dialog defaults (format/parent). Override with ensure_project.dialog when needed.',
  'Prefer id fields when updating or deleting items.',
  'Pass ifRevision on mutations to guard against stale state.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  RIGGING_WORKFLOW_INSTRUCTIONS,
  TEXTURE_WORKFLOW_INSTRUCTIONS
].join(' ');

export const SIDECAR_TOOL_INSTRUCTIONS = [
  'Use get_project_state (or includeState/includeDiff) before mutations and include ifRevision.',
  'toolRegistry.hash is the authoritative schema change signal; toolSchemaVersion is coarse.',
  'Modeling is low-level only: add_bone/add_cube.',
  'Animations are low-level only: create_animation_clip -> set_keyframes -> set_trigger_keyframes.',
  'Animation keys are one-per-call: set_keyframes and set_trigger_keyframes accept exactly one key.',
  'Textures are low-level only: assign_texture -> preflight_texture -> set_face_uv (as needed) -> generate_texture_preset.',
  'Prefer ensure_project to create or reuse projects; use match/onMismatch/onMissing to control when a fresh project is created.',
  'ensure_project supports action="delete" to close the active project. Provide target.name to match the open project; set force=true to discard unsaved changes (no auto-save).',
  'ensure_project auto-confirms the Blockbench project dialog. Provide ensure_project.dialog values for required fields (e.g., format, parent) so creation can proceed without UI input.',
  'For Java Block/Item creation, the server auto-fills dialog defaults (format/parent). Override with ensure_project.dialog when needed.',
  'Prefer id-based updates.',
  'If you get invalid_state_revision_mismatch, call get_project_state and retry with the latest ifRevision.',
  RIGGING_WORKFLOW_INSTRUCTIONS,
  TEXTURE_WORKFLOW_INSTRUCTIONS
].join(' ');




