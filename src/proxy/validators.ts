import { ApplyTextureSpecPayload, ApplyUvSpecPayload, EntityPipelinePayload, ModelPipelinePayload, TexturePipelinePayload } from '../spec';
import { Limits, ToolResponse } from '../types';
import { errFromDomain, errWithCode } from './response';
import {
  ENTITY_ANIMATION_CHANNELS,
  ENTITY_ANIMATION_TRIGGER_TYPES,
  ENTITY_FORMATS,
  GECKOLIB_TARGET_VERSIONS,
  PREVIEW_MODES,
  TEXTURE_PRESET_NAMES
} from '../shared/toolConstants';
import {
  ANIMATION_FPS_INVALID,
  ANIMATION_LENGTH_INVALID,
  ANIMATION_LOOP_INVALID,
  ANIMATION_MODE_INVALID,
  ANIMATION_NAME_REQUIRED,
  ANIMATIONS_MUST_BE_ARRAY,
  ASSIGN_CUBE_IDS_ARRAY,
  ASSIGN_CUBE_NAMES_ARRAY,
  ASSIGN_ENTRY_REQUIRES_TEXTURE,
  ASSIGN_MUST_BE_ARRAY,
  CHANNEL_BONE_REQUIRED,
  CHANNEL_KEYS_MUST_BE_ARRAY,
  CHANNEL_TYPE_INVALID,
  CHANNELS_MUST_BE_ARRAY,
  FORMAT_REQUIRED,
  KEYFRAME_TIME_INVALID,
  KEYFRAME_VALUE_INVALID,
  MODEL_MODE_INVALID,
  MODEL_REQUIRED,
  PAYLOAD_REQUIRED,
  PLAN_ONLY_BOOLEAN,
  PLAN_ONLY_NO_ENSURE,
  PLAN_ONLY_NO_EXTRAS,
  PRESET_MODE_INVALID,
  PRESET_NAME_REQUIRED,
  PRESET_SIZE_EXCEEDS_MAX,
  PRESET_SIZE_INTEGER,
  PRESET_SIZE_POSITIVE,
  PRESET_UPDATE_REQUIRES_TARGET,
  PRESETS_MUST_BE_ARRAY,
  PREVIEW_MODE_INVALID,
  TARGET_VERSION_ONLY_GECKOLIB,
  TEXTURE_PIPELINE_STEP_REQUIRED,
  TOO_MANY_CUBES,
  TRIGGER_KEYS_MUST_BE_ARRAY,
  TRIGGER_TIME_INVALID,
  TRIGGER_TYPE_INVALID,
  TRIGGER_VALUE_INVALID,
  TRIGGERS_MUST_BE_ARRAY,
  UNSUPPORTED_FORMAT,
  UNSUPPORTED_TARGET_VERSION,
  UNKNOWN_TEXTURE_PRESET
} from '../shared/messages';
import { validateTextureSpecs } from '../domain/textureSpecValidation';
import { validateUvAssignments } from '../domain/uvAssignments';
import { checkDimensions, mapDimensionError } from '../domain/dimensions';
import { isRecord } from '../domain/guards';
import { validateModelSpec } from '../domain/modelSpecValidation';

const ENTITY_FORMAT_SET = new Set<string>(ENTITY_FORMATS);
const GECKOLIB_TARGET_VERSION_SET = new Set<string>(GECKOLIB_TARGET_VERSIONS);
const ENTITY_ANIMATION_CHANNEL_SET = new Set<string>(ENTITY_ANIMATION_CHANNELS);
const ENTITY_ANIMATION_TRIGGER_TYPE_SET = new Set<string>(ENTITY_ANIMATION_TRIGGER_TYPES);
const TEXTURE_PRESET_NAME_SET = new Set<string>(TEXTURE_PRESET_NAMES);
const PREVIEW_MODE_SET = new Set<string>(PREVIEW_MODES);

const validationOk = (): ToolResponse<void> => ({ ok: true, data: undefined });

const requirePayloadObject = (payload: unknown): ToolResponse<void> | null => {
  if (!payload || typeof payload !== 'object') return errWithCode('invalid_payload', PAYLOAD_REQUIRED);
  return null;
};


export const validateTextureSpec = (payload: ApplyTextureSpecPayload, limits: Limits): ToolResponse<void> => {
  const textureRes = validateTextureSpecs(payload.textures, limits);
  if (!textureRes.ok) return errFromDomain(textureRes.error);
  return validationOk();
};

export const validateUvSpec = (payload: ApplyUvSpecPayload): ToolResponse<void> => {
  const payloadErr = requirePayloadObject(payload);
  if (payloadErr) return payloadErr;
  const assignmentsRes = validateUvAssignments(payload.assignments);
  if (!assignmentsRes.ok) return errFromDomain(assignmentsRes.error);
  return validationOk();
};

export const validateEntityPipeline = (payload: EntityPipelinePayload, limits: Limits): ToolResponse<void> => {
  const payloadErr = requirePayloadObject(payload);
  if (payloadErr) return payloadErr;
  if (!payload.format) return errWithCode('invalid_payload', FORMAT_REQUIRED);
  if (payload.planOnly !== undefined && typeof payload.planOnly !== 'boolean') {
    return errWithCode('invalid_payload', PLAN_ONLY_BOOLEAN);
  }
  if (!ENTITY_FORMAT_SET.has(payload.format)) {
    return errWithCode('invalid_payload', UNSUPPORTED_FORMAT(payload.format));
  }
  if (payload.targetVersion && !GECKOLIB_TARGET_VERSION_SET.has(payload.targetVersion)) {
    return errWithCode('invalid_payload', UNSUPPORTED_TARGET_VERSION(payload.targetVersion));
  }
  if (payload.format !== 'geckolib' && payload.targetVersion) {
    return errWithCode('invalid_payload', TARGET_VERSION_ONLY_GECKOLIB);
  }
  if (payload.model) {
    const modelRes = validateModelSpec(payload.model);
    if (!modelRes.ok) return errFromDomain(modelRes.error);
  }
  if (payload.textures) {
    const texRes = validateTextureSpec({ textures: payload.textures, uvUsageId: payload.uvUsageId ?? '' }, limits);
    if (!texRes.ok) return texRes;
  }
  if (payload.animations) {
    if (!Array.isArray(payload.animations)) return errWithCode('invalid_payload', ANIMATIONS_MUST_BE_ARRAY);
    for (const anim of payload.animations) {
      if (!anim?.name) return errWithCode('invalid_payload', ANIMATION_NAME_REQUIRED);
      if (!Number.isFinite(anim.length) || anim.length <= 0) {
        return errWithCode('invalid_payload', ANIMATION_LENGTH_INVALID(anim.name));
      }
      if (typeof anim.loop !== 'boolean') {
        return errWithCode('invalid_payload', ANIMATION_LOOP_INVALID(anim.name));
      }
      if (anim.fps !== undefined && (!Number.isFinite(anim.fps) || anim.fps <= 0)) {
        return errWithCode('invalid_payload', ANIMATION_FPS_INVALID(anim.name));
      }
      if (anim.mode && !['create', 'update'].includes(anim.mode)) {
        return errWithCode('invalid_payload', ANIMATION_MODE_INVALID(anim.name));
      }
      if (anim.channels) {
        if (!Array.isArray(anim.channels)) {
          return errWithCode('invalid_payload', CHANNELS_MUST_BE_ARRAY(anim.name));
        }
        for (const channel of anim.channels) {
          if (!channel?.bone) return errWithCode('invalid_payload', CHANNEL_BONE_REQUIRED(anim.name));
          if (!ENTITY_ANIMATION_CHANNEL_SET.has(channel.channel)) {
            return errWithCode('invalid_payload', CHANNEL_TYPE_INVALID(anim.name));
          }
          if (!Array.isArray(channel.keys)) {
            return errWithCode('invalid_payload', CHANNEL_KEYS_MUST_BE_ARRAY(anim.name));
          }
          for (const key of channel.keys) {
            if (!Number.isFinite(key.time)) {
              return errWithCode('invalid_payload', KEYFRAME_TIME_INVALID(anim.name));
            }
            if (!Array.isArray(key.value) || key.value.length !== 3) {
              return errWithCode('invalid_payload', KEYFRAME_VALUE_INVALID(anim.name));
            }
          }
        }
      }
      if (anim.triggers) {
        if (!Array.isArray(anim.triggers)) {
          return errWithCode('invalid_payload', TRIGGERS_MUST_BE_ARRAY(anim.name));
        }
        for (const trigger of anim.triggers) {
          if (!ENTITY_ANIMATION_TRIGGER_TYPE_SET.has(trigger.type)) {
            return errWithCode('invalid_payload', TRIGGER_TYPE_INVALID(anim.name));
          }
          if (!Array.isArray(trigger.keys)) {
            return errWithCode('invalid_payload', TRIGGER_KEYS_MUST_BE_ARRAY(anim.name));
          }
          for (const key of trigger.keys) {
            if (!Number.isFinite(key.time)) {
              return errWithCode('invalid_payload', TRIGGER_TIME_INVALID(anim.name));
            }
            if (!isTriggerValue(key.value)) {
              return errWithCode('invalid_payload', TRIGGER_VALUE_INVALID(anim.name));
            }
          }
        }
      }
    }
  }
  return validationOk();
};

export const validateTexturePipeline = (payload: TexturePipelinePayload, limits: Limits): ToolResponse<void> => {
  const payloadErr = requirePayloadObject(payload);
  if (payloadErr) return payloadErr;
  if (payload.planOnly !== undefined && typeof payload.planOnly !== 'boolean') {
    return errWithCode('invalid_payload', PLAN_ONLY_BOOLEAN);
  }
  const hasStep = Boolean(
    (payload.assign && payload.assign.length > 0) ||
      payload.uv ||
      (payload.textures && payload.textures.length > 0) ||
      (payload.presets && payload.presets.length > 0) ||
      payload.preflight ||
      payload.preview
  );
  if (!hasStep) {
    return errWithCode('invalid_payload', TEXTURE_PIPELINE_STEP_REQUIRED);
  }

  if (payload.assign) {
    if (!Array.isArray(payload.assign)) return errWithCode('invalid_payload', ASSIGN_MUST_BE_ARRAY);
    for (const entry of payload.assign) {
      if (!entry?.textureId && !entry?.textureName) {
        return errWithCode('invalid_payload', ASSIGN_ENTRY_REQUIRES_TEXTURE);
      }
      if (entry.cubeIds && !Array.isArray(entry.cubeIds)) {
        return errWithCode('invalid_payload', ASSIGN_CUBE_IDS_ARRAY);
      }
      if (entry.cubeNames && !Array.isArray(entry.cubeNames)) {
        return errWithCode('invalid_payload', ASSIGN_CUBE_NAMES_ARRAY);
      }
    }
  }

  if (payload.uv) {
    const assignmentsRes = validateUvAssignments(payload.uv.assignments);
    if (!assignmentsRes.ok) return errFromDomain(assignmentsRes.error);
  }

  if (payload.textures) {
    const textureRes = validateTextureSpecs(payload.textures, limits);
    if (!textureRes.ok) return errFromDomain(textureRes.error);
  }

  if (payload.presets) {
    if (!Array.isArray(payload.presets)) return errWithCode('invalid_payload', PRESETS_MUST_BE_ARRAY);
    for (const preset of payload.presets) {
      if (!preset?.preset || typeof preset.preset !== 'string') {
        return errWithCode('invalid_payload', PRESET_NAME_REQUIRED);
      }
      if (!TEXTURE_PRESET_NAME_SET.has(preset.preset)) {
        return errWithCode('invalid_payload', UNKNOWN_TEXTURE_PRESET(preset.preset));
      }
      const width = Number(preset.width);
      const height = Number(preset.height);
      const dimCheck = checkDimensions(width, height, { requireInteger: true, maxSize: limits.maxTextureSize });
      const dimMessage = mapDimensionError(dimCheck, {
        nonPositive: (_axis) => PRESET_SIZE_POSITIVE,
        nonInteger: (_axis) => PRESET_SIZE_INTEGER,
        exceedsMax: (maxSize) => PRESET_SIZE_EXCEEDS_MAX(maxSize || limits.maxTextureSize)
      });
      if (dimMessage) {
        return errWithCode('invalid_payload', dimMessage);
      }
      if (preset.mode && !['create', 'update'].includes(preset.mode)) {
        return errWithCode('invalid_payload', PRESET_MODE_INVALID(preset.preset));
      }
      if ((preset.mode ?? 'create') === 'update' && !preset.targetId && !preset.targetName) {
        return errWithCode('invalid_payload', PRESET_UPDATE_REQUIRES_TARGET(preset.preset));
      }
    }
  }

  if (payload.preview) {
    const mode = payload.preview.mode;
    if (mode && !PREVIEW_MODE_SET.has(mode)) {
      return errWithCode('invalid_payload', PREVIEW_MODE_INVALID(mode));
    }
  }

  return validationOk();
};

export const validateModelPipeline = (payload: ModelPipelinePayload, limits: Limits): ToolResponse<void> => {
  const payloadErr = requirePayloadObject(payload);
  if (payloadErr) return payloadErr;
  if (!payload.model || typeof payload.model !== 'object') {
    return errWithCode('invalid_payload', MODEL_REQUIRED);
  }
  const modelRes = validateModelSpec(payload.model);
  if (!modelRes.ok) return errFromDomain(modelRes.error);
  const mode = payload.mode;
  if (mode && !['create', 'merge', 'replace', 'patch'].includes(mode)) {
    return errWithCode('invalid_payload', MODEL_MODE_INVALID(mode));
  }
  if (payload.planOnly !== undefined && typeof payload.planOnly !== 'boolean') {
    return errWithCode('invalid_payload', PLAN_ONLY_BOOLEAN);
  }
  if (payload.planOnly) {
    if (payload.ensureProject) {
      return errWithCode('invalid_payload', PLAN_ONLY_NO_ENSURE);
    }
    if (payload.preview || payload.validate || payload.export) {
      return errWithCode('invalid_payload', PLAN_ONLY_NO_EXTRAS);
    }
  }
  const cubes = (payload.model as { cubes?: unknown }).cubes;
  if (Array.isArray(cubes) && cubes.length > limits.maxCubes) {
    return errWithCode('invalid_payload', TOO_MANY_CUBES(cubes.length, limits.maxCubes));
  }
  return validationOk();
};

const isTriggerValue = (value: unknown): boolean => {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string');
  return isRecord(value);
};
