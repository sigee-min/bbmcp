import type { PaintFacesPayload, PaintFacesResult, ToolError } from '@ashfox/contracts/types/internal';
import type { TextureUsageResult } from '@ashfox/contracts/types/textureUsage';
import type { CubeFaceDirection } from '../../ports/editor';
import {
  TEXTURE_FACES_OP_REQUIRED,
  TEXTURE_FACES_COORD_SPACE_INVALID,
  TEXTURE_FACES_TEXTURE_REQUIRED,
  TEXTURE_RENDERER_UNAVAILABLE
} from '../../shared/messages';
import { fail, ok, type UsecaseResult } from '../result';
import type { TextureToolContext } from './context';
import { runPaintFacesPass } from './paintFacesPass';
import { captureTextureBackup, type TextureBackup } from './paintFacesRecovery';
import { normalizePaintTarget, resolveTextureForPaintFaces } from './paintFacesPayload';

const RECOVERY_ERROR_REASONS = new Set([
  'uv_usage_mismatch',
  'uv_overlap',
  'uv_scale_mismatch',
  'rect_outside_bounds',
  'no_rects',
  'no_bounds',
  'usage_missing'
]);

const RECOVERY_WARNING_CODES = new Set([
  'uv_no_rects',
  'uv_overlap',
  'uv_scale_mismatch',
  'uv_unresolved_refs',
  'uv_bounds_exceed'
]);

type PaintFacesUsageState = {
  uvUsageId?: string;
  usageRaw: TextureUsageResult;
  warningCodes: string[];
};

type PaintFacesExecutionState = {
  usage: PaintFacesUsageState;
  recoveryAttempts: NonNullable<PaintFacesResult['recovery']>['attempts'];
  maxRecoveries: number;
};

type PaintFacesPassRuntime = {
  ctx: TextureToolContext;
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>;
  payload: PaintFacesPayload;
  coordSpace: 'face' | 'texture';
  normalizedTarget: {
    cubeId?: string;
    cubeName?: string;
    faces: CubeFaceDirection[];
  };
  resolvedTexture: {
    id?: string;
    name: string;
    width?: number;
    height?: number;
  };
  backup: TextureBackup | null;
};

export const runPaintFaces = (
  ctx: TextureToolContext,
  payload: PaintFacesPayload
): UsecaseResult<PaintFacesResult> => {
  if (!ctx.textureRenderer) {
    return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  const textureRenderer = ctx.textureRenderer;
  const activeErr = ctx.ensureActive();
  if (activeErr) return fail(activeErr);
  const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
  if (revisionErr) return fail(revisionErr);

  const normalizedTargetRes = normalizePaintTarget(payload.target);
  if (!normalizedTargetRes.ok) return fail(normalizedTargetRes.error);
  const normalizedTarget = normalizedTargetRes.value;

  if (!payload.op || typeof payload.op !== 'object') {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_OP_REQUIRED });
  }
  const coordSpace = payload.coordSpace ?? 'face';
  if (coordSpace !== 'face' && coordSpace !== 'texture') {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_COORD_SPACE_INVALID });
  }

  const snapshot = ctx.getSnapshot();
  const defaultTextureName = snapshot.name ?? undefined;
  const textureName = payload.textureName ?? defaultTextureName ?? undefined;
  const textureId = payload.textureId;
  if (!textureName && !textureId) {
    return fail({ code: 'invalid_payload', message: TEXTURE_FACES_TEXTURE_REQUIRED });
  }

  const runner = ctx.runWithoutRevisionGuard ?? ((fn: () => UsecaseResult<PaintFacesResult>) => fn());
  return runner(() => {
    const resolvedTextureRes = resolveTextureForPaintFaces(ctx, payload, snapshot, textureId, textureName);
    if (!resolvedTextureRes.ok) return fail(resolvedTextureRes.error);
    const resolvedTexture = resolvedTextureRes.value;

    const backup = captureTextureBackup(ctx, textureRenderer, {
      id: resolvedTexture.id,
      name: resolvedTexture.name,
      width: resolvedTexture.width,
      height: resolvedTexture.height
    });

    if (ctx.assignTexture) {
      const assignRes = ctx.assignTexture({
        textureId: resolvedTexture.id ?? textureId,
        textureName: resolvedTexture.name,
        cubeIds: normalizedTarget.cubeId ? [normalizedTarget.cubeId] : undefined,
        cubeNames: normalizedTarget.cubeName ? [normalizedTarget.cubeName] : undefined,
        faces: normalizedTarget.faces,
        ifRevision: payload.ifRevision
      });
      if (!assignRes.ok) return fail(assignRes.error);
    }

    return runPaintFacesWithRecovery({
      ctx,
      textureRenderer,
      payload,
      coordSpace,
      normalizedTarget,
      resolvedTexture,
      backup
    });
  });
};

const runPaintFacesWithRecovery = (runtime: PaintFacesPassRuntime): UsecaseResult<PaintFacesResult> => {
  const stateRes = createPaintFacesExecutionState(runtime.ctx);
  if (!stateRes.ok) return fail(stateRes.error);
  const state = stateRes.value;

  const warning = state.usage.warningCodes.find((code) => RECOVERY_WARNING_CODES.has(code));
  if (warning) {
    const recoverRes = attemptPaintFacesRecovery(runtime, state, warning);
    if (!recoverRes.ok) return fail(recoverRes.error);
  }

  let paintRes = runPaintFacesPassWithState(runtime, state);
  if (!paintRes.ok && shouldRecoverPaintFacesError(paintRes.error)) {
    const reasonRaw =
      typeof paintRes.error.details?.reason === 'string' ? paintRes.error.details.reason : 'uv_recovery';
    const recoverRes = attemptPaintFacesRecovery(runtime, state, reasonRaw);
    if (!recoverRes.ok) return fail(recoverRes.error);
    if (recoverRes.value) {
      paintRes = runPaintFacesPassWithState(runtime, state);
    }
  }
  if (!paintRes.ok) return fail(paintRes.error);
  return ok(paintRes.value);
};

const runPaintFacesPassWithState = (
  runtime: PaintFacesPassRuntime,
  state: PaintFacesExecutionState
): UsecaseResult<PaintFacesResult> =>
  runPaintFacesPass({
    ctx: runtime.ctx,
    textureRenderer: runtime.textureRenderer,
    payload: runtime.payload,
    coordSpace: runtime.coordSpace,
    normalizedTarget: runtime.normalizedTarget,
    resolvedTexture: runtime.resolvedTexture,
    usageRaw: state.usage.usageRaw,
    uvUsageId: state.usage.uvUsageId,
    recoveryAttempts: state.recoveryAttempts,
    backup: runtime.backup
  });

const createPaintFacesExecutionState = (ctx: TextureToolContext): UsecaseResult<PaintFacesExecutionState> => {
  const usageRes = loadPaintFacesUsage(ctx);
  if (!usageRes.ok) return fail(usageRes.error);
  return ok({
    usage: usageRes.value,
    recoveryAttempts: [],
    maxRecoveries: resolveMaxRecoveries(ctx)
  });
};

const loadPaintFacesUsage = (ctx: TextureToolContext): UsecaseResult<PaintFacesUsageState> => {
  const preflight = ctx.preflightTexture ? ctx.preflightTexture({ includeUsage: true }) : null;
  if (preflight && !preflight.ok) return fail(preflight.error);
  const uvUsageId = preflight?.value.uvUsageId;
  let usageRaw = preflight?.value.textureUsage;
  const warningCodes = preflight?.value.warningCodes ?? [];
  if (!usageRaw) {
    const usageRes = ctx.editor.getTextureUsage({});
    if (usageRes.error) return fail(usageRes.error);
    usageRaw = usageRes.result ?? { textures: [] };
  }
  return ok({ uvUsageId, usageRaw, warningCodes });
};

const resolveMaxRecoveries = (ctx: TextureToolContext): number => {
  const policy = ctx.getUvPolicyConfig();
  const raw = policy.autoMaxRetries ?? 1;
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.trunc(raw));
};

const attemptPaintFacesRecovery = (
  runtime: PaintFacesPassRuntime,
  state: PaintFacesExecutionState,
  reason: string
): UsecaseResult<boolean> => {
  if (!runtime.ctx.autoUvAtlas) return ok(false);
  if (state.recoveryAttempts.length >= state.maxRecoveries) return ok(false);
  const beforeResolution = runtime.ctx.editor.getProjectTextureResolution() ?? undefined;
  const atlasRes = runtime.ctx.autoUvAtlas({ apply: true, ifRevision: runtime.payload.ifRevision });
  if (!atlasRes.ok) return fail(atlasRes.error);
  state.recoveryAttempts.push({
    reason,
    steps: atlasRes.value.steps,
    before: beforeResolution,
    after: atlasRes.value.resolution
  });
  const usageRes = loadPaintFacesUsage(runtime.ctx);
  if (!usageRes.ok) return fail(usageRes.error);
  state.usage = usageRes.value;
  return ok(true);
};

const shouldRecoverPaintFacesError = (error: ToolError): boolean => {
  const reason = typeof error.details?.reason === 'string' ? error.details.reason : '';
  return RECOVERY_ERROR_REASONS.has(reason);
};

