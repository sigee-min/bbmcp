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
import { resolveTextureTarget } from '../services/lookup';
import { TexturePresetResult, computeCoverage, generateTexturePreset } from '../domain/texturePresets';
import { resolveUvPaintRects, validateUvPaintSpec } from '../domain/uvPaint';
import { applyUvPaintPixels } from '../domain/uvPaintPixels';
import { guardUvOverlaps, guardUvScale, guardUvUsageId } from '../domain/uvGuards';
import { collectSingleTarget } from '../domain/uvTargets';
import { buildUvAtlasPlan } from '../domain/uvAtlas';
import { UvPolicyConfig } from '../domain/uvPolicy';
import { toDomainSnapshot, toDomainTextureUsage } from './domainMappers';

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
  const activeErr = ctx.ensureActive();
  if (activeErr) return fail(activeErr);
  const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
  if (revisionErr) return fail(revisionErr);
  if (!ctx.textureRenderer) {
    return fail({ code: 'not_implemented', message: 'Texture renderer unavailable.' });
  }
  const label = payload.name ?? payload.targetName ?? payload.targetId ?? payload.preset;
  if (!payload.uvUsageId || payload.uvUsageId.trim().length === 0) {
    return fail({
      code: 'invalid_payload',
      message: 'uvUsageId is required. Call preflight_texture before generate_texture_preset.'
    });
  }
  const width = Number(payload.width);
  const height = Number(payload.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fail({ code: 'invalid_payload', message: 'width and height must be positive numbers.' });
  }
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return fail({ code: 'invalid_payload', message: 'width and height must be integers.' });
  }
  const maxSize = ctx.capabilities.limits.maxTextureSize;
  if (width > maxSize || height > maxSize) {
    return fail({
      code: 'invalid_payload',
      message: `Texture size exceeds max ${maxSize}.`,
      fix: `Use width/height <= ${maxSize}.`,
      details: { width, height, maxSize }
    });
  }
  const uvPaintSpec = payload.uvPaint ?? { scope: 'rects', mapping: 'stretch' };
  const uvPaintValidation = validateUvPaintSpec(uvPaintSpec, ctx.capabilities.limits, label);
  if (!uvPaintValidation.ok) return fail(uvPaintValidation.error);
  const usageRes = ctx.editor.getTextureUsage({});
  if (usageRes.error) return fail(usageRes.error);
  const usageRaw = usageRes.result ?? { textures: [] };
  const usage = toDomainTextureUsage(usageRaw);
  const snapshot = ctx.getSnapshot();
  const usageIdError = guardUvUsageId(usage, payload.uvUsageId);
  if (usageIdError) return fail(usageIdError);
  const targets = collectSingleTarget({
    targetId: payload.targetId,
    targetName: payload.targetName,
    name: payload.name
  });
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
  const mode = payload.mode ?? (payload.targetId || payload.targetName ? 'update' : 'create');
  if (mode === 'create' && !payload.name) {
    return fail({
      code: 'invalid_payload',
      message: 'name is required when mode=create.'
    });
  }
  if (mode === 'update' && !payload.targetId && !payload.targetName) {
    return fail({
      code: 'invalid_payload',
      message: 'targetId or targetName is required when mode=update.'
    });
  }
  const target =
    mode === 'update'
      ? resolveTextureTarget(snapshot.textures, payload.targetId, payload.targetName)
      : null;
  if (mode === 'update' && !target) {
    const targetLabel = payload.targetId ?? payload.targetName ?? 'unknown';
    return fail({ code: 'invalid_payload', message: `Texture not found: ${targetLabel}` });
  }
  if (mode === 'create' && payload.name) {
    const conflict = snapshot.textures.some((texture) => texture.name === payload.name);
    if (conflict) {
      return fail({ code: 'invalid_payload', message: `Texture already exists: ${payload.name}` });
    }
  }
  const rectRes = resolveUvPaintRects(
    { name: payload.name, targetId: payload.targetId, targetName: payload.targetName, uvPaint: uvPaintSpec },
    usage
  );
  if (!rectRes.ok) return fail(rectRes.error);
  const sourceWidth = Number(uvPaintSpec.source?.width ?? width);
  const sourceHeight = Number(uvPaintSpec.source?.height ?? height);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return fail({ code: 'invalid_payload', message: 'uvPaint source width/height must be positive numbers.' });
  }
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight)) {
    return fail({ code: 'invalid_payload', message: 'uvPaint source width/height must be integers.' });
  }
  if (sourceWidth > maxSize || sourceHeight > maxSize) {
    return fail({
      code: 'invalid_payload',
      message: `uvPaint source size exceeds max ${maxSize}.`,
      fix: `Use width/height <= ${maxSize}.`,
      details: { width: sourceWidth, height: sourceHeight, maxSize }
    });
  }
  const preset: TexturePresetResult = generateTexturePreset({
    preset: payload.preset,
    width: sourceWidth,
    height: sourceHeight,
    seed: payload.seed,
    palette: payload.palette
  });
  const paintRes = applyUvPaintPixels({
    source: { width: preset.width, height: preset.height, data: preset.data },
    target: { width, height },
    config: {
      rects: rectRes.data.rects,
      mapping: uvPaintSpec.mapping ?? 'stretch',
      padding:
        typeof uvPaintSpec.padding === 'number' && Number.isFinite(uvPaintSpec.padding)
          ? Math.max(0, uvPaintSpec.padding)
          : 0,
      anchor: Array.isArray(uvPaintSpec.anchor) ? uvPaintSpec.anchor : [0, 0]
    },
    label
  });
  if (!paintRes.ok) return fail(paintRes.error);
  const coverage = computeCoverage(paintRes.data.data, width, height);
  const renderRes = ctx.textureRenderer.renderPixels({
    width,
    height,
    data: paintRes.data.data
  });
  if (renderRes.error) return fail(renderRes.error);
  if (!renderRes.result) {
    return fail({ code: 'not_implemented', message: 'Texture renderer failed to produce an image.' });
  }
  const image = renderRes.result.image;
  const updateResult =
    mode === 'update'
      ? ctx.updateTexture({
          id: target?.id,
          name: target?.name,
          newName: payload.name,
          image,
          width,
          height,
          ifRevision: payload.ifRevision
        })
      : ctx.importTexture({
          name: payload.name ?? payload.preset,
          image,
          width,
          height,
          ifRevision: payload.ifRevision
        });
  if (!updateResult.ok) return updateResult as UsecaseResult<GenerateTexturePresetResult>;
  return ok({
    textureId: updateResult.value.id,
    textureName: updateResult.value.name,
    preset: payload.preset,
    mode,
    width,
    height,
    seed: preset.seed,
    coverage
  });
};

export const runAutoUvAtlas = (
  ctx: TextureToolContext,
  payload: AutoUvAtlasPayload
): UsecaseResult<AutoUvAtlasResult> => {
  const activeErr = ctx.ensureActive();
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
    return fail({ code: 'invalid_state', message: 'No textures are assigned to any cube faces.' });
  }
  const unresolvedCount = usage.unresolved?.length ?? 0;
  if (unresolvedCount > 0) {
    return fail({
      code: 'invalid_state',
      message: `Unresolved texture references detected (${unresolvedCount}). Assign textures before atlas packing.`
    });
  }
  const resolution = ctx.editor.getProjectTextureResolution();
  if (!resolution) {
    return fail({
      code: 'invalid_state',
      message: 'Project textureResolution is missing. Set it before atlas packing.'
    });
  }
  const padding =
    typeof payload.padding === 'number' && Number.isFinite(payload.padding)
      ? Math.max(0, Math.trunc(payload.padding))
      : 0;
  const snapshot = ctx.getSnapshot();
  const domainSnapshot = toDomainSnapshot(snapshot);
  const planRes = buildUvAtlasPlan({
    usage,
    cubes: domainSnapshot.cubes,
    resolution,
    maxResolution: { width: ctx.capabilities.limits.maxTextureSize, height: ctx.capabilities.limits.maxTextureSize },
    padding,
    policy: ctx.getUvPolicyConfig()
  });
  if (!planRes.ok) return fail(planRes.error);
  const plan = planRes.data;
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
