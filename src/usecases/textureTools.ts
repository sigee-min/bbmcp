import {
  AutoUvAtlasPayload,
  AutoUvAtlasResult,
  Capabilities,
  GenerateTexturePresetPayload,
  GenerateTexturePresetResult,
  ToolError
} from '../types';
import { EditorPort } from '../ports/editor';
import { TextureRendererPort } from '../ports/textureRenderer';
import { SessionState } from '../session';
import { UsecaseResult, fail, ok } from './result';
import { resolveTextureOrError } from '../services/targetGuards';
import { TexturePresetResult, computeCoverage, generateTexturePreset } from '../domain/texturePresets';
import { resolveUvPaintRects, validateUvPaintSpec, type UvPaintRect } from '../domain/uvPaint';
import { applyUvPaintPixels } from '../domain/uvPaintPixels';
import { guardUvOverlaps, guardUvScale, guardUvUsageId } from '../domain/uvGuards';
import { collectSingleTarget } from '../domain/uvTargets';
import { buildUvAtlasPlan } from '../domain/uvAtlas';
import { UvPolicyConfig } from '../domain/uvPolicy';
import { toDomainSnapshot, toDomainTextureUsage } from './domainMappers';
import { checkDimensions, mapDimensionError } from '../domain/dimensions';
import { requireUvUsageId } from '../domain/uvUsageId';
import { ensureActiveAndRevision, ensureActiveOnly } from './guards';
import { ensureNonBlankString } from '../services/validation';
import { validateUvPaintSourceSize } from '../domain/uvPaintSource';
import { fromDomainResult } from './fromDomain';
import {
  DIMENSION_INTEGER_MESSAGE,
  DIMENSION_POSITIVE_MESSAGE,
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_AUTO_UV_NO_TEXTURES,
  TEXTURE_AUTO_UV_RESOLUTION_MISSING,
  TEXTURE_AUTO_UV_UNRESOLVED_REFS,
  TEXTURE_PRESET_MODE_INVALID,
  TEXTURE_PRESET_NAME_REQUIRED,
  TEXTURE_PRESET_SIZE_EXCEEDS_MAX,
  TEXTURE_PRESET_SIZE_EXCEEDS_MAX_FIX,
  TEXTURE_PRESET_TARGET_REQUIRED,
  TEXTURE_PRESET_UV_USAGE_REQUIRED,
  TEXTURE_RENDERER_NO_IMAGE,
  TEXTURE_RENDERER_UNAVAILABLE
} from '../shared/messages';

export type TextureToolContext = {
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  getSnapshot: () => SessionState;
  editor: EditorPort;
  textureRenderer?: TextureRendererPort;
  capabilities: Capabilities;
  getUvPolicyConfig: () => UvPolicyConfig;
  importTexture: (payload: {
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  }) => UsecaseResult<{ id: string; name: string }>;
  updateTexture: (payload: {
    id?: string;
    name?: string;
    newName?: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  }) => UsecaseResult<{ id: string; name: string }>;
};

export const runGenerateTexturePreset = (
  ctx: TextureToolContext,
  payload: GenerateTexturePresetPayload
): UsecaseResult<GenerateTexturePresetResult> => {
  const guardErr = ensureActiveAndRevision(ctx.ensureActive, ctx.ensureRevisionMatch, payload.ifRevision);
  if (guardErr) return fail(guardErr);
  const ctxRes = validateTexturePresetContext(ctx, payload);
  if (!ctxRes.ok) return fail(ctxRes.error);
  const paintRes = buildPaintedTexture(ctx, ctxRes.value);
  if (!paintRes.ok) return fail(paintRes.error);
  const { image, coverage } = paintRes.value;
  const updateRes = upsertTextureFromPreset(ctx, payload, ctxRes.value, image);
  if (!updateRes.ok) return fail(updateRes.error);
  return ok({
    textureId: updateRes.value.id,
    textureName: updateRes.value.name,
    preset: payload.preset,
    mode: ctxRes.value.mode,
    width: ctxRes.value.width,
    height: ctxRes.value.height,
    seed: ctxRes.value.preset.seed,
    coverage
  });
};

export const runAutoUvAtlas = (
  ctx: TextureToolContext,
  payload: AutoUvAtlasPayload
): UsecaseResult<AutoUvAtlasResult> => {
  const activeErr = ensureActiveOnly(ctx.ensureActive);
  if (activeErr) return fail(activeErr);
  const apply = payload.apply !== false;
  if (apply) {
    const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
  }
  const usageRes = ctx.editor.getTextureUsage({});
  if (usageRes.error) return fail(usageRes.error);
  const usageRaw = usageRes.result ?? { textures: [] };
  const usage = toDomainTextureUsage(usageRaw);
  if (usage.textures.length === 0) {
    return fail({ code: 'invalid_state', message: TEXTURE_AUTO_UV_NO_TEXTURES });
  }
  const unresolvedCount = usage.unresolved?.length ?? 0;
  if (unresolvedCount > 0) {
    return fail({
      code: 'invalid_state',
      message: TEXTURE_AUTO_UV_UNRESOLVED_REFS(unresolvedCount)
    });
  }
  const resolution = ctx.editor.getProjectTextureResolution();
  if (!resolution) {
    return fail({
      code: 'invalid_state',
      message: TEXTURE_AUTO_UV_RESOLUTION_MISSING
    });
  }
  const padding =
    typeof payload.padding === 'number' && Number.isFinite(payload.padding)
      ? Math.max(0, Math.trunc(payload.padding))
      : 0;
  const snapshot = ctx.getSnapshot();
  const domainSnapshot = toDomainSnapshot(snapshot);
  const planRes = fromDomainResult(
    buildUvAtlasPlan({
      usage,
      cubes: domainSnapshot.cubes,
      resolution,
      maxResolution: { width: ctx.capabilities.limits.maxTextureSize, height: ctx.capabilities.limits.maxTextureSize },
      padding,
      policy: ctx.getUvPolicyConfig()
    })
  );
  if (!planRes.ok) return fail(planRes.error);
  const plan = planRes.value;
  if (!apply) {
    return ok({
      applied: false,
      steps: plan.steps,
      resolution: plan.resolution,
      textures: plan.textures
    });
  }
  if (plan.resolution.width !== resolution.width || plan.resolution.height !== resolution.height) {
    const err = ctx.editor.setProjectTextureResolution(plan.resolution.width, plan.resolution.height, false);
    if (err) return fail(err);
  }
  const updatesByCube = new Map<string, Record<string, [number, number, number, number]>>();
  plan.assignments.forEach((assignment) => {
    const entry = updatesByCube.get(assignment.cubeName) ?? {};
    entry[assignment.face] = assignment.uv;
    updatesByCube.set(assignment.cubeName, entry);
  });
  const cubeIdByName = new Map(snapshot.cubes.map((cube) => [cube.name, cube.id]));
  for (const [cubeName, faces] of updatesByCube.entries()) {
    const cubeId = cubeIdByName.get(cubeName);
    const err = ctx.editor.setFaceUv({ cubeId, cubeName, faces });
    if (err) return fail(err);
  }
  return ok({
    applied: true,
    steps: plan.steps,
    resolution: plan.resolution,
    textures: plan.textures
  });
};

type TexturePresetContext = {
  label: string;
  width: number;
  height: number;
  uvPaintSpec: ReturnType<typeof resolveUvPaintSpec>;
  rects: UvPaintRect[];
  mode: 'create' | 'update';
  target: TextureTarget | null;
  preset: TexturePresetResult;
};

type TextureTarget = { id?: string; name: string };

const resolveUvPaintSpec = (payload: GenerateTexturePresetPayload) =>
  payload.uvPaint ?? { scope: 'rects', mapping: 'stretch' };

const validateTexturePresetContext = (
  ctx: TextureToolContext,
  payload: GenerateTexturePresetPayload
): UsecaseResult<TexturePresetContext> => {
  if (!ctx.textureRenderer) {
    return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  if (payload.mode && payload.mode !== 'create' && payload.mode !== 'update') {
    return fail({ code: 'invalid_payload', message: TEXTURE_PRESET_MODE_INVALID(payload.mode) });
  }
  const nameBlankErr = ensureNonBlankString(payload.name, 'name');
  if (nameBlankErr) return fail(nameBlankErr);
  const targetIdBlankErr = ensureNonBlankString(payload.targetId, 'targetId');
  if (targetIdBlankErr) return fail(targetIdBlankErr);
  const targetNameBlankErr = ensureNonBlankString(payload.targetName, 'targetName');
  if (targetNameBlankErr) return fail(targetNameBlankErr);
  const mode = payload.mode ?? (payload.targetId || payload.targetName ? 'update' : 'create');
  if (mode === 'create' && !payload.name) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_PRESET_NAME_REQUIRED
    });
  }
  let label =
    mode === 'update'
      ? payload.targetName ?? payload.targetId ?? payload.name ?? payload.preset
      : payload.name ?? payload.preset;
  const uvPaintLabel = payload.targetName ?? payload.targetId ?? label;
  const usageIdRes = requireUvUsageId(
    payload.uvUsageId,
    TEXTURE_PRESET_UV_USAGE_REQUIRED
  );
  if (!usageIdRes.ok) return fail(usageIdRes.error);
  const uvUsageId = usageIdRes.data;
  const width = Number(payload.width);
  const height = Number(payload.height);
  const maxSize = ctx.capabilities.limits.maxTextureSize;
  const sizeCheck = checkDimensions(width, height, { requireInteger: true, maxSize });
  if (!sizeCheck.ok) {
    const sizeMessage = mapDimensionError(sizeCheck, {
      nonPositive: (axis) => DIMENSION_POSITIVE_MESSAGE(axis, axis),
      nonInteger: (axis) => DIMENSION_INTEGER_MESSAGE(axis, axis),
      exceedsMax: (limit) => TEXTURE_PRESET_SIZE_EXCEEDS_MAX(limit || maxSize)
    });
    if (sizeCheck.reason === 'exceeds_max') {
      return fail({
        code: 'invalid_payload',
        message: sizeMessage ?? TEXTURE_PRESET_SIZE_EXCEEDS_MAX(maxSize),
        fix: TEXTURE_PRESET_SIZE_EXCEEDS_MAX_FIX(maxSize),
        details: { width, height, maxSize }
      });
    }
    return fail({ code: 'invalid_payload', message: sizeMessage ?? DIMENSION_POSITIVE_MESSAGE('width/height') });
  }
  const uvPaintSpec = resolveUvPaintSpec(payload);
  const uvPaintValidation = validateUvPaintSpec(uvPaintSpec, ctx.capabilities.limits, uvPaintLabel);
  if (!uvPaintValidation.ok) return fail(uvPaintValidation.error);
  const usageRes = ctx.editor.getTextureUsage({});
  if (usageRes.error) return fail(usageRes.error);
  const usageRaw = usageRes.result ?? { textures: [] };
  const usage = toDomainTextureUsage(usageRaw);
  const usageIdError = guardUvUsageId(usage, uvUsageId);
  if (usageIdError) return fail(usageIdError);
  const snapshot = ctx.getSnapshot();
  let target: TextureTarget | null = null;
  if (mode === 'update') {
    const resolved = resolveTextureOrError(snapshot.textures, payload.targetId, payload.targetName, {
      idLabel: 'targetId',
      nameLabel: 'targetName',
      required: { message: TEXTURE_PRESET_TARGET_REQUIRED }
    });
    if (resolved.error) return fail(resolved.error);
    target = resolved.target!;
  }
  if (mode === 'update' && payload.name && payload.name !== target?.name) {
    const conflict = snapshot.textures.some(
      (texture) => texture.name === payload.name && texture.id !== target?.id
    );
    if (conflict) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
    }
  }
  if (mode === 'create' && payload.name) {
    const conflict = snapshot.textures.some((texture) => texture.name === payload.name);
    if (conflict) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
    }
  }
  label = target?.name ?? uvPaintLabel;
  const uvPaintTarget =
    mode === 'update'
      ? { id: target?.id, name: target?.name }
      : { targetId: payload.targetId, targetName: payload.targetName, name: payload.name };
  const targets = collectSingleTarget(uvPaintTarget);
  const overlapError = guardUvOverlaps(usage, targets);
  if (overlapError) return fail(overlapError);
  const resolution = ctx.editor.getProjectTextureResolution() ?? { width, height };
  const domainSnapshot = toDomainSnapshot(snapshot);
  const scaleError = guardUvScale({
    usage,
    cubes: domainSnapshot.cubes,
    resolution,
    policy: ctx.getUvPolicyConfig(),
    targets
  });
  if (scaleError) return fail(scaleError);
  const rectRes = resolveUvPaintRects(
    { ...uvPaintTarget, uvPaint: uvPaintSpec },
    usage
  );
  if (!rectRes.ok) return fail(rectRes.error);
  const sourceRes = validateUvPaintSourceSize(
    Number(uvPaintSpec.source?.width ?? width),
    Number(uvPaintSpec.source?.height ?? height),
    ctx.capabilities.limits,
    uvPaintLabel,
    { requireInteger: true }
  );
  if (!sourceRes.ok) {
    const reason = sourceRes.error.details?.reason;
    if (reason === 'exceeds_max') {
      return fail({
        ...sourceRes.error,
        fix: `Use width/height <= ${maxSize}.`,
        details: { ...(sourceRes.error.details ?? {}), maxSize }
      });
    }
    return fail(sourceRes.error);
  }
  const sourceWidth = sourceRes.data.width;
  const sourceHeight = sourceRes.data.height;
  const preset: TexturePresetResult = generateTexturePreset({
    preset: payload.preset,
    width: sourceWidth,
    height: sourceHeight,
    seed: payload.seed,
    palette: payload.palette
  });
  return ok({
    label: target?.name ?? label,
    width,
    height,
    uvPaintSpec,
    rects: rectRes.data.rects,
    mode,
    target,
    preset
  });
};

const buildPaintedTexture = (
  ctx: TextureToolContext,
  context: TexturePresetContext
): UsecaseResult<{ image: CanvasImageSource; coverage: ReturnType<typeof computeCoverage> }> => {
  const padding = context.uvPaintSpec.padding ?? 0;
  const anchor = context.uvPaintSpec.anchor ?? [0, 0];
  const paintRes = applyUvPaintPixels({
    source: { width: context.preset.width, height: context.preset.height, data: context.preset.data },
    target: { width: context.width, height: context.height },
    config: {
      rects: context.rects,
      mapping: context.uvPaintSpec.mapping ?? 'stretch',
      padding,
      anchor
    },
    label: context.label
  });
  if (!paintRes.ok) return fail(paintRes.error);
  const coverage = computeCoverage(paintRes.data.data, context.width, context.height);
  const renderRes = ctx.textureRenderer?.renderPixels({
    width: context.width,
    height: context.height,
    data: paintRes.data.data
  });
  if (renderRes?.error) return fail(renderRes.error);
  if (!renderRes?.result) {
    return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_NO_IMAGE });
  }
  return ok({ image: renderRes.result.image, coverage });
};

const upsertTextureFromPreset = (
  ctx: TextureToolContext,
  payload: GenerateTexturePresetPayload,
  context: TexturePresetContext,
  image: CanvasImageSource
): UsecaseResult<{ id: string; name: string }> => {
  return context.mode === 'update'
    ? ctx.updateTexture({
        id: context.target?.id,
        name: context.target?.name,
        newName: payload.name,
        image,
        width: context.width,
        height: context.height,
        ifRevision: payload.ifRevision
      })
    : ctx.importTexture({
        name: payload.name!,
        image,
        width: context.width,
        height: context.height,
        ifRevision: payload.ifRevision
      });
};
