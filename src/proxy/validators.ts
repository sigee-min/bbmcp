import {
  ApplyAnimSpecPayload,
  ApplyModelSpecPayload,
  ApplyProjectSpecPayload,
  ApplyTextureSpecPayload,
  AnimInterp,
  TextureOp
} from '../spec';
import { Limits, ToolResponse } from '../types';
import { buildRigTemplate } from '../templates';
import { isZeroSize } from '../domain/geometry';
import { err } from './response';

const MAX_KEYS = 4096;
const SUPPORTED_INTERP: AnimInterp[] = ['linear', 'step', 'catmullrom'];

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

export const validateProjectSpec = (payload: ApplyProjectSpecPayload, limits: Limits): ToolResponse<unknown> => {
  if (!payload) return err('invalid_payload', 'payload is required');
  const hasModel = Boolean(payload.model);
  const hasImports = Array.isArray(payload.imports) && payload.imports.length > 0;
  const hasTextures = Array.isArray(payload.textures) && payload.textures.length > 0;
  const hasAnimation = Boolean(payload.animation);
  if (!hasModel && !hasImports && !hasTextures && !hasAnimation) {
    return err('invalid_payload', 'model, imports, textures, or animation is required');
  }
  if (payload.projectMode && !['auto', 'reuse', 'create'].includes(payload.projectMode)) {
    return err('invalid_payload', `invalid projectMode: ${payload.projectMode}`);
  }
  if (!hasModel && payload.projectMode === 'create') {
    return err('invalid_payload', 'projectMode=create requires model');
  }
  if (payload.imports && !Array.isArray(payload.imports)) {
    return err('invalid_payload', 'imports must be an array');
  }
  for (const tex of payload.imports ?? []) {
    if (!tex?.name) return err('invalid_payload', 'import texture name is required');
  }
  if (payload.model) {
    const res = validateModelSpec({ model: payload.model } as ApplyModelSpecPayload, limits);
    if (!res.ok) return res;
  }
  if (payload.textures) {
    const res = validateTextureSpec({ textures: payload.textures } as ApplyTextureSpecPayload, limits);
    if (!res.ok) return res;
  }
  if (payload.animation) {
    const res = validateAnimSpec({ animation: payload.animation } as ApplyAnimSpecPayload);
    if (!res.ok) return res;
  }
  return { ok: true, data: { valid: true } };
};

export const validateAnimSpec = (payload: ApplyAnimSpecPayload): ToolResponse<unknown> => {
  if (!payload.animation) return err('invalid_payload', 'animation is required');
  const { channels, duration, clip } = payload.animation;
  if (!clip) return err('invalid_payload', 'clip name required');
  if (duration <= 0) return err('invalid_payload', 'duration must be > 0');
  if (!Array.isArray(channels) || channels.length === 0) return err('invalid_payload', 'channels required');
  let keyCount = 0;
  for (const ch of channels) {
    if (!ch.bone) return err('invalid_payload', 'channel bone required');
    if (!['rot', 'pos', 'scale'].includes(ch.channel)) return err('invalid_payload', 'channel type invalid');
    if (!Array.isArray(ch.keys) || ch.keys.length === 0) return err('invalid_payload', 'keys required');
    for (const k of ch.keys) {
      keyCount += 1;
      if (keyCount > MAX_KEYS) return err('invalid_payload', `too many keys (>${MAX_KEYS})`);
      if (!Array.isArray(k.value) || k.value.length !== 3) return err('invalid_payload', 'key value invalid');
      if (k.interp && !SUPPORTED_INTERP.includes(k.interp)) {
        return err('invalid_payload', `unsupported interp ${k.interp}`);
      }
    }
  }
  return { ok: true, data: { valid: true } };
};

export const validateTextureSpec = (payload: ApplyTextureSpecPayload, limits: Limits): ToolResponse<unknown> => {
  if (!payload || !Array.isArray(payload.textures) || payload.textures.length === 0) {
    return err('invalid_payload', 'textures array is required');
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
    if (!Number.isFinite(tex.width) || tex.width <= 0) {
      return err('invalid_payload', `texture width must be > 0 (${label})`);
    }
    if (!Number.isFinite(tex.height) || tex.height <= 0) {
      return err('invalid_payload', `texture height must be > 0 (${label})`);
    }
    if (Number.isFinite(tex.width) && Number.isFinite(tex.height)) {
      if (tex.width > limits.maxTextureSize || tex.height > limits.maxTextureSize) {
        return err('invalid_payload', `texture size exceeds max ${limits.maxTextureSize} (${label})`);
      }
    }
    if (tex.ops && !Array.isArray(tex.ops)) {
      return err('invalid_payload', `texture ops must be an array (${label})`);
    }
    const ops = Array.isArray(tex.ops) ? tex.ops : [];
    for (const op of ops) {
      if (!isTextureOp(op)) {
        return err('invalid_payload', `invalid texture op (${label})`);
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
