import { Logger } from '../logging';
import {
  ApplyAnimSpecPayload,
  ApplyModelSpecPayload,
  ApplyProjectSpecPayload,
  ApplyTextureSpecPayload,
  TextureImportSpec,
  TextureSpec
} from '../spec';
import { Limits, ToolError, ToolResponse } from '../types';
import { ToolService } from '../usecases/ToolService';
import { buildRigTemplate } from '../templates';
import { buildMeta, MetaOptions, withErrorMeta } from './meta';
import { renderTextureSpec, resolveTextureBase } from './texture';
import { toToolResponse } from './response';
import { isZeroSize } from '../domain/geometry';

type ApplyErrorEntry = {
  step: string;
  item?: string;
  message: string;
};

export type ApplyReport = {
  applied: { bones: string[]; cubes: string[]; textures: string[]; animations: string[] };
  errors: ApplyErrorEntry[];
};

export const createApplyReport = (): ApplyReport => ({
  applied: { bones: [], cubes: [], textures: [], animations: [] },
  errors: []
});

export const applyTextureImports = (
  service: ToolService,
  imports: TextureImportSpec[] | undefined,
  report: ApplyReport,
  meta: MetaOptions
): ToolResponse<ApplyReport> => {
  for (const t of imports ?? []) {
    const res = service.importTexture({ id: t.id, name: t.name, dataUri: t.dataUri, path: t.path });
    if (!res.ok) return withReportError(res.error, report, 'import_texture', t.name, meta, service);
    report.applied.textures.push(t.name);
  }
  return { ok: true, data: report };
};

export const applyModelSpecSteps = (
  service: ToolService,
  log: Logger,
  payload: ApplyModelSpecPayload,
  report: ApplyReport,
  meta: MetaOptions,
  options?: { createProject?: boolean }
): ToolResponse<ApplyReport> => {
  if (options?.createProject !== false) {
    const sessionInit = toToolResponse(
      service.createProject(payload.model.format, payload.model.name, { ifRevision: payload.ifRevision })
    );
    if (!sessionInit.ok) return withReportError(sessionInit.error, report, 'create_project', undefined, meta, service);
  }

  const importRes = applyTextureImports(service, payload.textures, report, meta);
  if (!importRes.ok) return importRes;

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
      uv: part.uv,
      inflate: part.inflate,
      mirror: part.mirror
    });
    if (!cubeRes.ok) return withReportError(cubeRes.error, report, 'add_cube', part.id, meta, service);
    report.applied.cubes.push(part.id);
  }
  log.info('applyModelSpec applied', { parts: templatedParts.length });
  return { ok: true, data: report };
};

export const applyTextureSpecSteps = (
  service: ToolService,
  limits: Limits,
  textures: TextureSpec[],
  report: ApplyReport,
  meta: MetaOptions
): ToolResponse<ApplyReport> => {
  for (const texture of textures) {
    const label = texture.name ?? texture.targetName ?? texture.targetId ?? 'texture';
    const mode = texture.mode ?? 'create';
    if (mode === 'create') {
      const renderRes = renderTextureSpec(texture, limits);
      if (!renderRes.ok) {
        return withReportError(renderRes.error, report, 'render_texture', label, meta, service);
      }
      const res = service.importTexture({
        id: texture.id,
        name: texture.name ?? label,
        dataUri: renderRes.data.dataUri
      });
      if (!res.ok) return withReportError(res.error, report, 'import_texture', label, meta, service);
      report.applied.textures.push(texture.name ?? label);
      continue;
    }
    if (mode !== 'update') {
      return withReportError(
        { code: 'invalid_payload', message: `unsupported texture mode: ${mode}` },
        report,
        'update_texture',
        label,
        meta,
        service
      );
    }
    if (!texture.targetId && !texture.targetName) {
      return withReportError(
        { code: 'invalid_payload', message: 'targetId or targetName is required for update' },
        report,
        'update_texture',
        label,
        meta,
        service
      );
    }
    let base: { image: CanvasImageSource; width: number; height: number } | null = null;
    if (texture.useExisting) {
      const baseRes = toToolResponse(service.readTexture({ id: texture.targetId, name: texture.targetName }));
      if (!baseRes.ok) return withReportError(baseRes.error, report, 'read_texture', label, meta, service);
      const resolved = resolveTextureBase(baseRes.data);
      if (!resolved.ok) return withReportError(resolved.error, report, 'read_texture', label, meta, service);
      base = resolved.data;
    }
    const renderRes = renderTextureSpec(texture, limits, base ?? undefined);
    if (!renderRes.ok) {
      return withReportError(renderRes.error, report, 'render_texture', label, meta, service);
    }
    const res = service.updateTexture({
      id: texture.targetId,
      name: texture.targetName,
      newName: texture.name,
      dataUri: renderRes.data.dataUri
    });
    if (!res.ok) return withReportError(res.error, report, 'update_texture', label, meta, service);
    report.applied.textures.push(texture.name ?? texture.targetName ?? texture.targetId ?? label);
  }
  return { ok: true, data: report };
};

export const applyAnimSpecSteps = (
  service: ToolService,
  animation: ApplyAnimSpecPayload['animation'],
  report: ApplyReport,
  meta: MetaOptions
): ToolResponse<ApplyReport> => {
  const createRes = toToolResponse(
    service.createAnimationClip({
      name: animation.clip,
      length: animation.duration,
      loop: animation.loop,
      fps: animation.fps,
      ifRevision: meta.ifRevision
    })
  );
  if (!createRes.ok) return withReportError(createRes.error, report, 'create_animation_clip', animation.clip, meta, service);
  const clipId = createRes.data.id;
  for (const ch of animation.channels) {
    const res = toToolResponse(
      service.setKeyframes({
        clipId,
        clip: animation.clip,
        bone: ch.bone,
        channel: ch.channel,
        keys: ch.keys
      })
    );
    if (!res.ok) return withReportError(res.error, report, 'set_keyframes', ch.bone, meta, service);
  }
  report.applied.animations.push(animation.clip);
  return { ok: true, data: report };
};

export const resolveProjectMode = (
  mode: ApplyProjectSpecPayload['projectMode']
): 'auto' | 'reuse' | 'create' => mode ?? 'auto';

export const resolveProjectAction = (
  service: ToolService,
  format: ApplyModelSpecPayload['model']['format'],
  mode: 'auto' | 'reuse' | 'create',
  meta: MetaOptions
): ToolResponse<{ action: 'create' | 'reuse' }> => {
  if (mode === 'create') return { ok: true, data: { action: 'create' } };
  const state = service.getProjectState({ detail: 'summary' });
  if (!state.ok || !state.value.project.active) {
    if (mode === 'reuse') {
      return withErrorMeta(
        { code: 'invalid_state', message: 'No active project to reuse.' },
        meta,
        service
      );
    }
    return { ok: true, data: { action: 'create' } };
  }
  const currentFormat = state.value.project.format;
  if (!currentFormat || currentFormat !== format) {
    if (mode === 'reuse') {
      return withErrorMeta(
        { code: 'invalid_state', message: `Active project format mismatch (${currentFormat ?? 'unknown'} != ${format}).` },
        meta,
        service
      );
    }
    return { ok: true, data: { action: 'create' } };
  }
  return { ok: true, data: { action: 'reuse' } };
};

export const ensureActiveProject = (service: ToolService, meta: MetaOptions): ToolResponse<{ ok: true }> => {
  const state = service.getProjectState({ detail: 'summary' });
  if (state.ok && state.value.project.active) return { ok: true, data: { ok: true } };
  return withErrorMeta({ code: 'invalid_state', message: 'No active project to reuse.' }, meta, service);
};

const withReportError = (
  error: ToolError,
  report: ApplyReport,
  step: string,
  item: string | undefined,
  meta: MetaOptions,
  service: ToolService
): ToolResponse<unknown> => {
  const nextReport = recordApplyError(report, step, item, error.message);
  const details: Record<string, unknown> = { ...(error.details ?? {}), report: nextReport, ...buildMeta(meta, service) };
  return { ok: false, error: { ...error, details } };
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
