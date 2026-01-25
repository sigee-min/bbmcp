import { Logger } from '../logging';
import {
  ApplyModelSpecPayload,
  ApplyTextureSpecPayload,
  TextureSpec
} from '../spec';
import { Limits, ToolError, ToolResponse } from '../types';
import type { DomPort } from '../ports/dom';
import { ToolService } from '../usecases/ToolService';
import { buildRigTemplate } from '../templates';
import { buildMeta, MetaOptions } from './meta';
import { renderTextureSpec, resolveTextureBase, resolveTextureSpecSize, TextureCoverage, UvPaintRenderConfig } from './texture';
import { errFromDomain, toToolResponse } from '../services/toolResponse';
import { isZeroSize } from '../domain/geometry';
import { TextureUsage } from '../domain/model';
import { resolveUvPaintRects } from './uvPaint';
import { validateUvPaintSourceSize } from '../domain/uvPaintSource';

type ApplyErrorEntry = {
  step: string;
  item?: string;
  message: string;
};

type TextureCoverageReport = {
  id?: string;
  name: string;
  mode: 'create' | 'update';
  width: number;
  height: number;
  coverage?: TextureCoverage;
};

export type ApplyReport = {
  applied: { bones: string[]; cubes: string[]; textures: string[]; animations: string[] };
  errors: ApplyErrorEntry[];
  textureCoverage?: TextureCoverageReport[];
};

export const createApplyReport = (): ApplyReport => ({
  applied: { bones: [], cubes: [], textures: [], animations: [] },
  errors: []
});

export const applyModelSpecSteps = (
  service: ToolService,
  log: Logger,
  payload: ApplyModelSpecPayload,
  report: ApplyReport,
  meta: MetaOptions
): ToolResponse<ApplyReport> => {
  const templatedParts = buildRigTemplate(payload.model.rigTemplate, payload.model.parts);
  for (const part of templatedParts) {
    const boneRes = service.addBone({
      id: part.id,
      name: part.id,
      parent: part.parent,
      pivot: part.pivot ?? [0, 0, 0]
    });
    if (!boneRes.ok) return withReportError(boneRes.error, report, 'add_bone', part.id, meta, service);
    report.applied.bones.push(part.id);
    if (isZeroSize(part.size)) continue;
    const from: [number, number, number] = [...part.offset];
    const to: [number, number, number] = [
      part.offset[0] + part.size[0],
      part.offset[1] + part.size[1],
      part.offset[2] + part.size[2]
    ];
    const cubeRes = service.addCube({
      id: part.id,
      name: part.id,
      from,
      to,
      bone: part.id,
      inflate: part.inflate,
      mirror: part.mirror
    });
    if (!cubeRes.ok) return withReportError(cubeRes.error, report, 'add_cube', part.id, meta, service);
    report.applied.cubes.push(part.id);
  }
  log.info('applyModelSpec applied', { parts: templatedParts.length });
  return { ok: true, data: report };
};

export const applyTextureSpecSteps = async (
  service: ToolService,
  dom: DomPort,
  limits: Limits,
  textures: TextureSpec[],
  report: ApplyReport,
  meta: MetaOptions,
  log?: Logger,
  usage?: TextureUsage
): Promise<ToolResponse<ApplyReport>> => {
  for (const texture of textures) {
    const label = texture.name ?? texture.targetName ?? texture.targetId ?? 'texture';
    const mode = texture.mode ?? 'create';
    log?.info('applyTextureSpec ops', { texture: label, mode, ops: summarizeOps(texture.ops) });
    const size = resolveTextureSpecSize(texture);
    const ops = Array.isArray(texture.ops) ? texture.ops : [];
    const hasPaint = ops.length > 0 || Boolean(texture.background);
    const uvPaintSpec = hasPaint ? (texture.uvPaint ?? { scope: 'rects', mapping: 'stretch' }) : texture.uvPaint;
    let uvPaintConfig: UvPaintRenderConfig | undefined;
    if (uvPaintSpec && hasPaint) {
      if (!usage) {
        return withReportError(
          {
            code: 'invalid_state',
            message: 'UV mapping is required before painting. Assign the texture and set per-face UVs, then call preflight_texture.'
          },
          report,
          'uv_paint',
          label,
          meta,
          service
        );
      }
      const rectRes = resolveUvPaintRects({ ...texture, uvPaint: uvPaintSpec }, usage);
      if (!rectRes.ok) return withReportError(rectRes.error, report, 'uv_paint', label, meta, service);
      const sourceRes = validateUvPaintSourceSize(
        Number(uvPaintSpec.source?.width ?? size.width),
        Number(uvPaintSpec.source?.height ?? size.height),
        limits,
        label,
        { requireInteger: false }
      );
      if (!sourceRes.ok) {
        return withReportError(sourceRes.error, report, 'uv_paint', label, meta, service);
      }
      const sourceWidth = sourceRes.data.width;
      const sourceHeight = sourceRes.data.height;
      const anchor =
        Array.isArray(uvPaintSpec.anchor) && uvPaintSpec.anchor.length === 2
          ? ([uvPaintSpec.anchor[0], uvPaintSpec.anchor[1]] as [number, number])
          : ([0, 0] as [number, number]);
      const padding =
        typeof uvPaintSpec.padding === 'number' && Number.isFinite(uvPaintSpec.padding)
          ? Math.max(0, uvPaintSpec.padding)
          : 0;
      uvPaintConfig = {
        rects: rectRes.data.rects,
        mapping: uvPaintSpec.mapping ?? 'stretch',
        padding,
        anchor,
        source: { width: Math.trunc(sourceWidth), height: Math.trunc(sourceHeight) }
      };
    }
    const uvPaintApplied = Boolean(uvPaintConfig);
    if (mode === 'create') {
      const renderRes = renderTextureSpec(dom, texture, limits, undefined, uvPaintConfig);
      if (!renderRes.ok) {
        return withReportError(renderRes.error, report, 'render_texture', label, meta, service);
      }
      recordTextureCoverage(report, texture, renderRes.data, 'create', label);
      const coverageCheck = guardTextureCoverage(
        renderRes.data.coverage,
        texture,
        label,
        report,
        meta,
        service,
        renderRes.data.paintCoverage,
        uvPaintApplied
      );
      if (!coverageCheck.ok) return coverageCheck;
      const res = service.importTexture({
        id: texture.id,
        name: texture.name ?? label,
        image: renderRes.data.canvas,
        width: size.width ?? renderRes.data.width,
        height: size.height ?? renderRes.data.height
      });
      if (!res.ok) return withReportError(res.error, report, 'texture_create', label, meta, service);
      const sizeCheck = ensureTextureSizeMatches(service, texture, label, meta, report);
      if (!sizeCheck.ok) return sizeCheck;
      report.applied.textures.push(texture.name ?? label);
      continue;
    }
    if (mode !== 'update') {
      return withReportError(
        { code: 'invalid_payload', message: `unsupported texture mode: ${mode}` },
        report,
        'texture_update',
        label,
        meta,
        service
      );
    }
    if (!texture.targetId && !texture.targetName) {
      return withReportError(
        { code: 'invalid_payload', message: 'targetId or targetName is required for update' },
        report,
        'texture_update',
        label,
        meta,
        service
      );
    }
    let base: { image: CanvasImageSource; width: number; height: number } | null = null;
    let baseDataUri: string | null = null;
    if (texture.useExisting) {
      log?.info('applyTextureSpec base requested', { texture: label });
      const baseRes = toToolResponse(service.readTexture({ id: texture.targetId, name: texture.targetName }));
      if (!baseRes.ok) {
        log?.warn('applyTextureSpec base missing', { texture: label, code: baseRes.error.code });
        return withReportError(baseRes.error, report, 'read_texture', label, meta, service);
      }
      baseDataUri = baseRes.data.dataUri ?? null;
      const resolved = await resolveTextureBase(dom, baseRes.data);
      if (!resolved.ok) {
        log?.warn('applyTextureSpec base unresolved', { texture: label, code: resolved.error.code });
        return withReportError(resolved.error, report, 'read_texture', label, meta, service);
      }
      base = resolved.data;
      log?.info('applyTextureSpec base resolved', {
        texture: label,
        width: base.width,
        height: base.height
      });
    }
    const renderRes = renderTextureSpec(dom, texture, limits, base ?? undefined, uvPaintConfig);
    if (!renderRes.ok) {
      return withReportError(renderRes.error, report, 'render_texture', label, meta, service);
    }
    recordTextureCoverage(report, texture, renderRes.data, 'update', label);
    if (baseDataUri) {
      const renderedDataUri = renderRes.data.canvas.toDataURL('image/png');
      if (renderedDataUri === baseDataUri) {
        return withReportError(
          { code: 'no_change', message: 'Texture content is unchanged.' },
          report,
          'texture_update',
          label,
          meta,
          service
        );
      }
    }
    const res = service.updateTexture({
      id: texture.targetId,
      name: texture.targetName,
      newName: texture.name,
      image: renderRes.data.canvas,
      width: size.width ?? renderRes.data.width,
      height: size.height ?? renderRes.data.height
    });
    if (!res.ok) return withReportError(res.error, report, 'texture_update', label, meta, service);
    const sizeCheck = ensureTextureSizeMatches(service, texture, label, meta, report);
    if (!sizeCheck.ok) return sizeCheck;
    report.applied.textures.push(texture.name ?? texture.targetName ?? texture.targetId ?? label);
  }
  return { ok: true, data: report };
};

const withReportError = (
  error: ToolError,
  report: ApplyReport,
  step: string,
  item: string | undefined,
  meta: MetaOptions,
  service: ToolService
): ToolResponse<ApplyReport> => {
  const nextReport = recordApplyError(report, step, item, error.message);
  const details: Record<string, unknown> = { ...(error.details ?? {}), report: nextReport, ...buildMeta(meta, service) };
  return errFromDomain({ ...error, details });
};

const recordApplyError = (
  report: ApplyReport,
  step: string,
  item: string | undefined,
  message: string
): ApplyReport => {
  report.errors.push({ step, item, message });
  return report;
};

const MIN_OPAQUE_RATIO = 0.05;

const guardTextureCoverage = (
  coverage: TextureCoverage | undefined,
  texture: TextureSpec,
  label: string,
  report: ApplyReport,
  meta: MetaOptions,
  service: ToolService,
  paintCoverage?: TextureCoverage,
  usePaintCoverage?: boolean
): ToolResponse<ApplyReport> => {
  const mode = texture.mode ?? 'create';
  if (mode !== 'create') return { ok: true, data: report };
  const ops = Array.isArray(texture.ops) ? texture.ops : [];
  if (ops.length === 0 && !texture.background) return { ok: true, data: report };
  const effectiveCoverage = usePaintCoverage && paintCoverage ? paintCoverage : coverage;
  if (!effectiveCoverage || effectiveCoverage.totalPixels === 0) return { ok: true, data: report };
  if (effectiveCoverage.opaqueRatio >= MIN_OPAQUE_RATIO) return { ok: true, data: report };
  const ratio = Math.round(effectiveCoverage.opaqueRatio * 1000) / 10;
  return withReportError(
    {
      code: 'invalid_payload',
      message: `Texture coverage too low for "${label}" (${ratio}% opaque).`,
      fix: 'Fill a larger opaque area, use an opaque background, or set per-face UVs to the painted bounds.',
      details: {
        coverage: effectiveCoverage,
        hint: 'Low opaque coverage + full-face UVs yields transparent results.'
      }
    },
    report,
    'texture_coverage',
    label,
    meta,
    service
  );
};

const ensureTextureSizeMatches = (
  service: ToolService,
  texture: TextureSpec,
  label: string,
  meta: MetaOptions,
  report: ApplyReport
): ToolResponse<ApplyReport> => {
  const expected = resolveTextureSpecSize(texture);
  const expectedWidth = Number(expected.width);
  const expectedHeight = Number(expected.height);
  if (!Number.isFinite(expectedWidth) || !Number.isFinite(expectedHeight) || expectedWidth <= 0 || expectedHeight <= 0) {
    return { ok: true, data: report };
  }
  const id = texture.id ?? texture.targetId;
  const name = texture.name ?? texture.targetName ?? label;
  const readRes = toToolResponse(service.readTexture({ id, name }));
  if (!readRes.ok) {
    return { ok: true, data: report };
  }
  const actualWidth = Number(readRes.data.width ?? 0);
  const actualHeight = Number(readRes.data.height ?? 0);
  if (!Number.isFinite(actualWidth) || !Number.isFinite(actualHeight) || actualWidth <= 0 || actualHeight <= 0) {
    return { ok: true, data: report };
  }
  if (actualWidth !== expectedWidth || actualHeight !== expectedHeight) {
    const resolution = service.getProjectTextureResolution();
    return withReportError(
      {
        code: 'invalid_state',
        message: `Texture size mismatch for "${name}": expected ${expectedWidth}x${expectedHeight}, got ${actualWidth}x${actualHeight}.`,
        fix: 'Call set_project_texture_resolution to match the target size, then recreate the texture.',
        details: {
          expected: { width: expectedWidth, height: expectedHeight },
          actual: { width: actualWidth, height: actualHeight },
          textureResolution: resolution ?? undefined
        }
      },
      report,
      'texture_size_mismatch',
      label,
      meta,
      service
    );
  }
  return { ok: true, data: report };
};
const summarizeOps = (ops: TextureSpec['ops'] | undefined) => {
  const list = Array.isArray(ops) ? ops : [];
  const counts = new Map<string, number>();
  list.forEach((op) => {
    counts.set(op.op, (counts.get(op.op) ?? 0) + 1);
  });
  return {
    total: list.length,
    byOp: Object.fromEntries(counts)
  };
};

const recordTextureCoverage = (
  report: ApplyReport,
  texture: TextureSpec,
  render: { width: number; height: number; coverage?: TextureCoverage },
  mode: 'create' | 'update',
  label: string
) => {
  const name = texture.name ?? texture.targetName ?? label;
  const entry: TextureCoverageReport = {
    id: texture.id ?? texture.targetId ?? undefined,
    name,
    mode,
    width: render.width,
    height: render.height,
    coverage: render.coverage ?? undefined
  };
  if (!report.textureCoverage) {
    report.textureCoverage = [entry];
    return;
  }
  report.textureCoverage.push(entry);
};
