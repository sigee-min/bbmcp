import {
  ApplyEntitySpecPayload,
  ApplyModelSpecPayload,
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  TextureOp
} from '../spec';
import { resolveTextureSpecSize } from './texture';
import { Limits, ToolResponse } from '../types';
import { buildRigTemplate } from '../templates';
import { isZeroSize } from '../domain/geometry';
import { err } from './response';
import { validateUvPaintSpec } from '../domain/uvPaint';
import { CubeFaceDirection } from '../ports/editor';

const MAX_TEX_OPS = 4096;

export const validateModelSpec = (payload: ApplyModelSpecPayload, limits: Limits): ToolResponse<unknown> => {
  if (!payload.model) return err('invalid_payload', 'model is required');
  const inputParts = payload.model.parts ?? [];
  if (!Array.isArray(inputParts)) return err('invalid_payload', 'parts must be an array');
  const rigTemplate = payload.model.rigTemplate ?? 'empty';
  if (!['empty', 'biped', 'quadruped', 'block_entity'].includes(rigTemplate)) {
    return err('invalid_payload', `unknown rigTemplate: ${rigTemplate}`);
  }
  const templatedParts = buildRigTemplate(rigTemplate, inputParts);
  const cubeCount = templatedParts.filter((part) => !isZeroSize(part.size)).length;
  if (inputParts.length === 0 && templatedParts.length === 0) {
    return err(
      'invalid_payload',
      'parts or rigTemplate must provide parts (set model.rigTemplate or supply model.parts with id/size/offset).'
    );
  }
  if (cubeCount > limits.maxCubes) return err('invalid_payload', `too many parts (>${limits.maxCubes})`);
  const ids = new Set<string>();
  for (const p of inputParts) {
    if (!p.id) return err('invalid_payload', 'part id required');
    if (ids.has(p.id)) return err('invalid_payload', `duplicate part id: ${p.id}`);
    ids.add(p.id);
    if (!Array.isArray(p.size) || p.size.length !== 3) return err('invalid_payload', `size invalid for ${p.id}`);
    if (!Array.isArray(p.offset) || p.offset.length !== 3) return err('invalid_payload', `offset invalid for ${p.id}`);
  }
  for (const p of templatedParts) {
    if (!Array.isArray(p.size) || p.size.length !== 3) return err('invalid_payload', `size invalid for ${p.id}`);
    if (!Array.isArray(p.offset) || p.offset.length !== 3) return err('invalid_payload', `offset invalid for ${p.id}`);
  }
  return { ok: true, data: { valid: true } };
};

export const validateTextureSpec = (payload: ApplyTextureSpecPayload, limits: Limits): ToolResponse<unknown> => {
  if (!payload || !Array.isArray(payload.textures) || payload.textures.length === 0) {
    return err('invalid_payload', 'textures array is required');
  }
  if (typeof payload.uvUsageId !== 'string' || payload.uvUsageId.trim().length === 0) {
    return err('invalid_payload', 'uvUsageId is required. Call preflight_texture before apply_texture_spec.');
  }
  for (const tex of payload.textures) {
    const label = tex?.name ?? tex?.targetName ?? tex?.targetId ?? 'texture';
    const mode = tex?.mode ?? 'create';
    if (mode !== 'create' && mode !== 'update') {
      return err('invalid_payload', `unsupported texture mode ${mode} (${label})`);
    }
    if (mode === 'create' && !tex?.name) {
      return err('invalid_payload', `texture name is required (${label})`);
    }
    if (mode === 'update' && !tex?.targetId && !tex?.targetName) {
      return err('invalid_payload', `targetId or targetName is required (${label})`);
    }
    const size = resolveTextureSpecSize(tex);
    const width = size.width;
    const height = size.height;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return err('invalid_payload', `texture width must be > 0 (${label})`);
    }
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
      return err('invalid_payload', `texture height must be > 0 (${label})`);
    }
    if (width > limits.maxTextureSize || height > limits.maxTextureSize) {
      return err('invalid_payload', `texture size exceeds max ${limits.maxTextureSize} (${label})`);
    }
    const ops = Array.isArray(tex.ops) ? tex.ops : [];
    if (ops.length > MAX_TEX_OPS) {
      return err('invalid_payload', `too many texture ops (>${MAX_TEX_OPS}) (${label})`);
    }
    for (const op of ops) {
      if (!isTextureOp(op)) {
        return err('invalid_payload', `invalid texture op (${label})`);
      }
    }
    if (tex.uvPaint !== undefined) {
      const uvPaintRes = validateUvPaintSpec(tex.uvPaint, limits, label);
      if (!uvPaintRes.ok) return uvPaintRes;
    }
  }
  return { ok: true, data: { valid: true } };
};

export const validateUvSpec = (payload: ApplyUvSpecPayload): ToolResponse<unknown> => {
  if (!payload || typeof payload !== 'object') return err('invalid_payload', 'payload is required');
  if (!Array.isArray(payload.assignments) || payload.assignments.length === 0) {
    return err('invalid_payload', 'assignments must be a non-empty array');
  }
  if (typeof payload.uvUsageId !== 'string' || payload.uvUsageId.trim().length === 0) {
    return err('invalid_payload', 'uvUsageId is required. Call preflight_texture before apply_uv_spec.');
  }
  for (const assignment of payload.assignments) {
    if (!assignment || typeof assignment !== 'object') {
      return err('invalid_payload', 'assignment must be an object');
    }
    const hasTarget =
      Boolean(assignment.cubeId) ||
      Boolean(assignment.cubeName) ||
      (Array.isArray(assignment.cubeIds) && assignment.cubeIds.length > 0) ||
      (Array.isArray(assignment.cubeNames) && assignment.cubeNames.length > 0);
    if (!hasTarget) {
      return err('invalid_payload', 'assignment must include cubeId/cubeName or cubeIds/cubeNames');
    }
    if (assignment.cubeIds && !assignment.cubeIds.every((id: unknown) => typeof id === 'string')) {
      return err('invalid_payload', 'cubeIds must be an array of strings');
    }
    if (assignment.cubeNames && !assignment.cubeNames.every((name: unknown) => typeof name === 'string')) {
      return err('invalid_payload', 'cubeNames must be an array of strings');
    }
    if (!assignment.faces || typeof assignment.faces !== 'object') {
      return err('invalid_payload', 'faces is required for each assignment');
    }
    const faceEntries = Object.entries(assignment.faces);
    if (faceEntries.length === 0) {
      return err('invalid_payload', 'faces must include at least one mapping');
    }
    for (const [faceKey, uv] of faceEntries) {
      if (!VALID_FACES.has(faceKey as CubeFaceDirection)) {
        return err('invalid_payload', `invalid face: ${faceKey}`);
      }
      if (!Array.isArray(uv) || uv.length !== 4) {
        return err('invalid_payload', `UV for ${faceKey} must be [x1,y1,x2,y2]`);
      }
      if (!uv.every((value) => Number.isFinite(value))) {
        return err('invalid_payload', `UV for ${faceKey} must contain finite numbers`);
      }
    }
  }
  return { ok: true, data: { valid: true } };
};

export const validateEntitySpec = (payload: ApplyEntitySpecPayload, limits: Limits): ToolResponse<unknown> => {
  if (!payload || typeof payload !== 'object') return err('invalid_payload', 'payload is required');
  if (!payload.format) return err('invalid_payload', 'format is required');
  if (!['geckolib', 'modded_entity', 'optifine_entity'].includes(payload.format)) {
    return err('invalid_payload', `unsupported format: ${payload.format}`);
  }
  if (payload.targetVersion && !['v3', 'v4'].includes(payload.targetVersion)) {
    return err('invalid_payload', `unsupported targetVersion: ${payload.targetVersion}`);
  }
  if (payload.format !== 'geckolib' && payload.targetVersion) {
    return err('invalid_payload', 'targetVersion is only valid for geckolib format');
  }
  if (payload.model) {
    const modelRes = validateModelSpec({ model: payload.model }, limits);
    if (!modelRes.ok) return modelRes;
  }
  if (payload.textures) {
    if (!payload.uvUsageId || payload.uvUsageId.trim().length === 0) {
      return err('invalid_payload', 'uvUsageId is required when textures are provided');
    }
    const texRes = validateTextureSpec({ textures: payload.textures, uvUsageId: payload.uvUsageId }, limits);
    if (!texRes.ok) return texRes;
  }
  if (payload.animations) {
    if (!Array.isArray(payload.animations)) return err('invalid_payload', 'animations must be an array');
    for (const anim of payload.animations) {
      if (!anim?.name) return err('invalid_payload', 'animation name is required');
      if (!Number.isFinite(anim.length) || anim.length <= 0) {
        return err('invalid_payload', `animation length must be > 0 (${anim.name})`);
      }
      if (typeof anim.loop !== 'boolean') {
        return err('invalid_payload', `animation loop must be boolean (${anim.name})`);
      }
      if (anim.fps !== undefined && (!Number.isFinite(anim.fps) || anim.fps <= 0)) {
        return err('invalid_payload', `animation fps must be > 0 (${anim.name})`);
      }
      if (anim.mode && !['create', 'update'].includes(anim.mode)) {
        return err('invalid_payload', `animation mode invalid (${anim.name})`);
      }
      if (anim.channels) {
        if (!Array.isArray(anim.channels)) return err('invalid_payload', `channels must be array (${anim.name})`);
        for (const channel of anim.channels) {
          if (!channel?.bone) return err('invalid_payload', `channel bone required (${anim.name})`);
          if (!['rot', 'pos', 'scale'].includes(channel.channel)) {
            return err('invalid_payload', `channel type invalid (${anim.name})`);
          }
          if (!Array.isArray(channel.keys)) {
            return err('invalid_payload', `channel keys must be array (${anim.name})`);
          }
          for (const key of channel.keys) {
            if (!Number.isFinite(key.time)) {
              return err('invalid_payload', `keyframe time invalid (${anim.name})`);
            }
            if (!Array.isArray(key.value) || key.value.length !== 3) {
              return err('invalid_payload', `keyframe value invalid (${anim.name})`);
            }
          }
        }
      }
      if (anim.triggers) {
        if (!Array.isArray(anim.triggers)) return err('invalid_payload', `triggers must be array (${anim.name})`);
        for (const trigger of anim.triggers) {
          if (!['sound', 'particle', 'timeline'].includes(trigger.type)) {
            return err('invalid_payload', `trigger type invalid (${anim.name})`);
          }
          if (!Array.isArray(trigger.keys)) {
            return err('invalid_payload', `trigger keys must be array (${anim.name})`);
          }
          for (const key of trigger.keys) {
            if (!Number.isFinite(key.time)) {
              return err('invalid_payload', `trigger time invalid (${anim.name})`);
            }
            if (!isTriggerValue(key.value)) {
              return err('invalid_payload', `trigger value invalid (${anim.name})`);
            }
          }
        }
      }
    }
  }
  return { ok: true, data: { valid: true } };
};

const isTextureOp = (op: unknown): op is TextureOp => {
  if (!isRecord(op) || typeof op.op !== 'string') return false;
  switch (op.op) {
    case 'set_pixel':
      return isFiniteNumber(op.x) && isFiniteNumber(op.y) && typeof op.color === 'string';
    case 'fill_rect':
    case 'draw_rect':
      return (
        isFiniteNumber(op.x) &&
        isFiniteNumber(op.y) &&
        isFiniteNumber(op.width) &&
        isFiniteNumber(op.height) &&
        typeof op.color === 'string'
      );
    case 'draw_line':
      return (
        isFiniteNumber(op.x1) &&
        isFiniteNumber(op.y1) &&
        isFiniteNumber(op.x2) &&
        isFiniteNumber(op.y2) &&
        typeof op.color === 'string'
      );
    default:
      return false;
  }
};

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const VALID_FACES = new Set<CubeFaceDirection>(['north', 'south', 'east', 'west', 'up', 'down']);

const isTriggerValue = (value: unknown): boolean => {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string');
  return isRecord(value);
};
