import type {
  EntityPipelinePayload,
  ModelBoneSpec,
  ModelSpec,
  TexturePipelinePayload,
  TextureSpec
} from '../spec';

const isZeroVec = (value?: [number, number, number]): boolean =>
  !value || value.every((entry) => entry === 0);

const isMinimalRootBone = (bone: ModelBoneSpec | undefined): boolean => {
  if (!bone) return false;
  const label = (bone.id ?? bone.name ?? '').toLowerCase();
  if (!label || label !== 'root') return false;
  const hasExtras =
    Boolean(bone.parentId) ||
    Boolean(bone.pivotAnchorId) ||
    Boolean(bone.rotation) ||
    Boolean(bone.scale) ||
    Boolean(bone.visibility);
  return !hasExtras && isZeroVec(bone.pivot);
};

export const isMinimalModelSpec = (model: ModelSpec | undefined | null): boolean => {
  if (!model) return true;
  const bones = Array.isArray(model.bones) ? model.bones : [];
  const cubes = Array.isArray(model.cubes) ? model.cubes : [];
  const instances = Array.isArray(model.instances) ? model.instances : [];
  if (cubes.length > 0 || instances.length > 0) return false;
  if (bones.length === 0) return true;
  if (bones.length > 1) return false;
  return isMinimalRootBone(bones[0]);
};

const MODEL_CLARIFICATION_QUESTIONS = [
  'What should I model? (short noun, e.g., "chair")',
  'Target size in px? (e.g., 16x16x16)',
  'Detail level? (simple / medium / detailed)'
];

export const getModelClarificationQuestions = (model: ModelSpec): string[] =>
  isMinimalModelSpec(model) ? [...MODEL_CLARIFICATION_QUESTIONS] : [];

const hasTextureContent = (texture: TextureSpec): boolean => {
  const hasOps = Array.isArray(texture.ops) && texture.ops.length > 0;
  const hasUvPaint = Boolean(texture.uvPaint);
  const hasBackground = typeof texture.background === 'string' && texture.background.length > 0;
  const hasExisting = Boolean(texture.useExisting);
  return hasOps || hasUvPaint || hasBackground || hasExisting;
};

export const getTexturePipelineClarificationQuestions = (payload: TexturePipelinePayload): string[] => {
  const textures = Array.isArray(payload.textures) ? payload.textures : [];
  const presets = Array.isArray(payload.presets) ? payload.presets : [];
  const blankTextures =
    textures.length > 0 && textures.every((texture) => !hasTextureContent(texture));
  if (blankTextures && presets.length === 0) {
    return [
      'Paint or keep blank? (paint / blank)',
      'If paint: palette or style? (short)'
    ];
  }
  return [];
};

export const getEntityPipelineClarificationQuestions = (payload: EntityPipelinePayload): string[] => {
  const hasModel = Boolean(payload.model);
  const hasTextures = Array.isArray(payload.textures) && payload.textures.length > 0;
  const hasAnimations = Array.isArray(payload.animations) && payload.animations.length > 0;

  if (!hasModel && !hasTextures && !hasAnimations) {
    return ['What should I update? (model / textures / animations)'];
  }

  const questions: string[] = [];
  if (hasTextures && !payload.uvUsageId) {
    questions.push('uvUsageId? (paste from preflight_texture, or say "run preflight")');
  }
  if (payload.model && isMinimalModelSpec(payload.model) && !hasTextures && !hasAnimations) {
    questions.push('What entity should I model? (short noun)');
    questions.push('Geometry scope? (skeleton-only / add cubes now)');
  }
  return questions;
};
