import type { Capabilities, PreflightTextureResult, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import { computeTextureUsageId } from '../../domain/textureUsage';
import {
  computeUvOverlapIssues,
  computeUvRectIssues,
  computeUvScaleIssues,
  formatOverlapExample,
  formatRectExample,
  formatScaleExample
} from '../../domain/uv/issues';
import { toDomainCube, toDomainTextureUsage } from '../domainMappers';
import { withActiveOnly } from '../guards';
import { ok, fail, type UsecaseResult } from '../result';
import {
  computeUvBounds,
  recommendResolution,
  summarizeTextureUsage
} from './textureUsageUtils';
import {
  TEXTURE_NOT_FOUND,
  TEXTURE_PREFLIGHT_BOUNDS_EXCEED,
  TEXTURE_PREFLIGHT_NO_UV_RECTS,
  TEXTURE_PREFLIGHT_OVERLAP_WARNING,
  TEXTURE_PREFLIGHT_SKEWED_UV_RECTS,
  TEXTURE_PREFLIGHT_SMALL_UV_RECTS,
  TEXTURE_PREFLIGHT_UNRESOLVED_REFS,
  UV_SCALE_MESSAGE
} from '../../shared/messages';

const UV_RECT_MIN_AREA = 9;
const UV_RECT_MAX_ASPECT = 3;

export type TexturePreflightContext = {
  ensureActive: () => ToolError | null;
  ensureTextureSelector: (textureId?: string, textureName?: string) => ToolError | null;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot?: () => import('../../session').SessionState;
  getUvPolicyConfig?: () => import('../../domain/uv/policy').UvPolicyConfig;
};

export const runTexturePreflight = (
  ctx: TexturePreflightContext,
  payload: { textureId?: string; textureName?: string; includeUsage?: boolean }
): UsecaseResult<PreflightTextureResult> => {
  return withActiveOnly(ctx.ensureActive, () => {
    const selectorErr = ctx.ensureTextureSelector(payload.textureId, payload.textureName);
    if (selectorErr) return fail(selectorErr);
    const usageRes = ctx.editor.getTextureUsage({});
    if (usageRes.error) return fail(usageRes.error);
    const usageRawFull = usageRes.result ?? { textures: [] };
    const textureResolution = ctx.editor.getProjectTextureResolution() ?? undefined;
    const uvUsageId = computeTextureUsageId(toDomainTextureUsage(usageRawFull), textureResolution);
    let usageRaw = usageRawFull;
    if (payload.textureId || payload.textureName) {
      const label = payload.textureId ?? payload.textureName ?? 'texture';
      const match = usageRawFull.textures.find(
        (entry) =>
          (payload.textureId && entry.id === payload.textureId) ||
          (payload.textureName && entry.name === payload.textureName)
      );
      if (!match) {
        return fail({ code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) });
      }
      usageRaw = {
        textures: [match],
        ...(usageRawFull.unresolved ? { unresolved: usageRawFull.unresolved } : {})
      };
    }
    const usage = toDomainTextureUsage(usageRaw);
    const usageSummary = summarizeTextureUsage(usageRaw);
    const uvBounds = computeUvBounds(usageRaw);
    const warnings: string[] = [];
    const warningCodes: PreflightTextureResult['warningCodes'] = [];
    if (!uvBounds) {
      warnings.push(TEXTURE_PREFLIGHT_NO_UV_RECTS);
      warningCodes.push('uv_no_rects');
    }
    if (usageSummary.unresolvedCount > 0) {
      warnings.push(TEXTURE_PREFLIGHT_UNRESOLVED_REFS(usageSummary.unresolvedCount));
      warningCodes.push('uv_unresolved_refs');
    }
    if (textureResolution && uvBounds) {
      if (uvBounds.maxX > textureResolution.width || uvBounds.maxY > textureResolution.height) {
        warnings.push(
          TEXTURE_PREFLIGHT_BOUNDS_EXCEED(
            uvBounds.maxX,
            uvBounds.maxY,
            textureResolution.width,
            textureResolution.height
          )
        );
        warningCodes.push('uv_bounds_exceed');
      }
    }
    const overlaps = computeUvOverlapIssues(usage);
    overlaps.forEach((overlap) => {
      const example = formatOverlapExample(overlap.example);
      warnings.push(TEXTURE_PREFLIGHT_OVERLAP_WARNING(overlap.textureName, overlap.conflictCount, example));
      warningCodes.push('uv_overlap');
    });
    const snapshot = ctx.getSnapshot?.();
    const policy = ctx.getUvPolicyConfig?.();
    if (snapshot && policy && textureResolution) {
      const cubes = snapshot.cubes.map((cube) => toDomainCube(cube));
      const scaleResult = computeUvScaleIssues(usage, cubes, textureResolution, policy);
      if (scaleResult.issues.length > 0) {
        const sample = scaleResult.issues[0];
        const example = sample.example ? ` Example: ${formatScaleExample(sample.example)}.` : '';
        const names = scaleResult.issues
          .slice(0, 3)
          .map((issue) => `"${issue.textureName}"`)
          .join(', ');
        const suffix = scaleResult.issues.length > 3 ? ` (+${scaleResult.issues.length - 3} more)` : '';
        warnings.push(UV_SCALE_MESSAGE(names, suffix, example, scaleResult.issues.length !== 1));
        warningCodes.push('uv_scale_mismatch');
      }
    }
    const rectIssues = computeUvRectIssues(usage, { minArea: UV_RECT_MIN_AREA, maxAspect: UV_RECT_MAX_ASPECT });
    rectIssues.small.forEach((issue) => {
      warnings.push(
        TEXTURE_PREFLIGHT_SMALL_UV_RECTS(
          issue.textureName,
          issue.count,
          UV_RECT_MIN_AREA,
          formatRectExample(issue.example)
        )
      );
      warningCodes.push('uv_rect_small');
    });
    rectIssues.skewed.forEach((issue) => {
      warnings.push(
        TEXTURE_PREFLIGHT_SKEWED_UV_RECTS(
          issue.textureName,
          issue.count,
          UV_RECT_MAX_ASPECT,
          formatRectExample(issue.example)
        )
      );
      warningCodes.push('uv_rect_skewed');
    });
    const recommendedResolution = recommendResolution(uvBounds, textureResolution, ctx.capabilities.limits.maxTextureSize);
    const result: PreflightTextureResult = {
      uvUsageId,
      warnings,
      warningCodes: warningCodes.length > 0 ? Array.from(new Set(warningCodes)) : undefined,
      usageSummary,
      uvBounds: uvBounds ?? undefined,
      textureResolution,
      recommendedResolution: recommendedResolution ?? undefined,
      textureUsage: payload.includeUsage ? usageRaw : undefined
    };
    return ok(result);
  });
};


