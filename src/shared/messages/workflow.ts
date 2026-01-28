export const MODELING_WORKFLOW_WARNING_REASON =
  'Model pipeline warnings were reported. Review the modeling workflow to address anchors/instances/id policy.';

export const VALIDATE_REASON_DEFAULT = 'Run validation to catch structural issues.';

export const PREVIEW_REASON_DEFAULT = 'Render a quick preview to validate the result visually.';

export const PREVIEW_STATE_REASON = 'Get latest ifRevision for preview.';

export const TEXTURE_WORKFLOW_GUIDE_REASON_DEFAULT =
  'Review the recommended UV-first texture workflow (assign -> preflight -> paint -> preview).';

export const TEXTURE_ASSIGN_QUESTION = (labelHint: string) =>
  `Which cubes should use ${labelHint}? (Provide cubeNames or say "all" if safe.)`;

export const TEXTURE_ASSIGN_REASON_DEFAULT =
  'assign_texture needs a scope (cubeNames/cubeIds). Avoid clobbering multi-texture models.';

export const TEXTURE_ASSIGN_MISSING_REASON =
  'Textures were generated/painted, but no assignment step was provided. Assign textures to cubes to make them visible.';

export const TEXTURE_ASSIGN_ASK_REASON_DEFAULT =
  'Avoid clobbering multi-texture models by assigning blindly.';

export const TEXTURE_PREVIEW_VALIDATE_REASON = 'Render a preview to validate textures.';

export const CLARIFICATION_REASON_DEFAULT =
  'Provide the missing details so the pipeline can proceed. Reply with short answers or pick an option.';
