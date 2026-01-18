import { Logger } from '../logging';
import { Limits, RenderPreviewPayload, RenderPreviewResult, ToolResponse } from '../types';
import {
  ApplyAnimSpecPayload,
  ApplyModelSpecPayload,
  ApplyProjectSpecPayload,
  ApplyTextureSpecPayload,
  ProxyTool
} from '../spec';
import { ToolService } from '../usecases/ToolService';
import { buildRenderPreviewContent, buildRenderPreviewStructured } from '../mcp/content';
import {
  applyAnimSpecSteps,
  applyModelSpecSteps,
  applyTextureImports,
  applyTextureSpecSteps,
  createApplyReport,
  ensureActiveProject,
  resolveProjectAction,
  resolveProjectMode
} from './apply';
import {
  guardRevision,
  MetaOptions,
  resolveDiffDetail,
  resolveIncludeDiff,
  resolveIncludeState,
  withMeta
} from './meta';
import { err, toToolResponse } from './response';
import { validateAnimSpec, validateModelSpec, validateProjectSpec, validateTextureSpec } from './validators';

export class ProxyRouter {
  private readonly service: ToolService;
  private readonly log: Logger;
  private readonly limits: Limits;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;

  constructor(
    service: ToolService,
    log: Logger,
    limits: Limits,
    options?: { includeStateByDefault?: boolean | (() => boolean); includeDiffByDefault?: boolean | (() => boolean) }
  ) {
    this.service = service;
    this.log = log;
    this.limits = limits;
    const flag = options?.includeStateByDefault;
    this.includeStateByDefault = typeof flag === 'function' ? flag : () => Boolean(flag);
    const diffFlag = options?.includeDiffByDefault;
    this.includeDiffByDefault = typeof diffFlag === 'function' ? diffFlag : () => Boolean(diffFlag);
  }

  applyModelSpec(payload: ApplyModelSpecPayload): ToolResponse<unknown> {
    const v = validateModelSpec(payload, this.limits);
    if (!v.ok) return v;
    const includeState = resolveIncludeState(payload.includeState, this.includeStateByDefault);
    const meta: MetaOptions = {
      includeState,
      includeDiff: resolveIncludeDiff(payload.includeDiff, this.includeDiffByDefault),
      diffDetail: resolveDiffDetail(payload.diffDetail),
      ifRevision: payload.ifRevision
    };
    const revisionError = guardRevision(this.service, payload.ifRevision, meta);
    if (revisionError) return revisionError;
    return this.runWithoutRevisionGuard(() => {
      const report = createApplyReport();
      const result = applyModelSpecSteps(this.service, this.log, payload, report, meta);
      if (!result.ok) return result;
      return { ok: true, data: withMeta({ applied: true, report }, meta, this.service) };
    });
  }

  applyTextureSpec(payload: ApplyTextureSpecPayload): ToolResponse<unknown> {
    const v = validateTextureSpec(payload, this.limits);
    if (!v.ok) return v;
    const includeState = resolveIncludeState(payload.includeState, this.includeStateByDefault);
    const meta: MetaOptions = {
      includeState,
      includeDiff: resolveIncludeDiff(payload.includeDiff, this.includeDiffByDefault),
      diffDetail: resolveDiffDetail(payload.diffDetail),
      ifRevision: payload.ifRevision
    };
    const guard = guardRevision(this.service, payload.ifRevision, meta);
    if (guard) return guard;
    return this.runWithoutRevisionGuard(() => {
      const report = createApplyReport();
      const result = applyTextureSpecSteps(this.service, this.limits, payload.textures, report, meta);
      if (!result.ok) return result;
      this.log.info('applyTextureSpec applied', { textures: payload.textures.length });
      return { ok: true, data: withMeta({ applied: true, report }, meta, this.service) };
    });
  }

  applyAnimSpec(payload: ApplyAnimSpecPayload): ToolResponse<unknown> {
    const v = validateAnimSpec(payload);
    if (!v.ok) return v;
    const a = payload.animation;
    const includeState = resolveIncludeState(payload.includeState, this.includeStateByDefault);
    const meta: MetaOptions = {
      includeState,
      includeDiff: resolveIncludeDiff(payload.includeDiff, this.includeDiffByDefault),
      diffDetail: resolveDiffDetail(payload.diffDetail),
      ifRevision: payload.ifRevision
    };
    const guard = guardRevision(this.service, payload.ifRevision, meta);
    if (guard) return guard;
    return this.runWithoutRevisionGuard(() => {
      const report = createApplyReport();
      const result = applyAnimSpecSteps(this.service, a, report, meta);
      if (!result.ok) return result;
      this.log.info('applyAnimSpec applied', { clip: a.clip, channels: a.channels.length });
      return { ok: true, data: withMeta({ applied: true, report }, meta, this.service) };
    });
  }

  applyProjectSpec(payload: ApplyProjectSpecPayload): ToolResponse<unknown> {
    const v = validateProjectSpec(payload, this.limits);
    if (!v.ok) return v;
    const includeState = resolveIncludeState(payload.includeState, this.includeStateByDefault);
    const meta: MetaOptions = {
      includeState,
      includeDiff: resolveIncludeDiff(payload.includeDiff, this.includeDiffByDefault),
      diffDetail: resolveDiffDetail(payload.diffDetail),
      ifRevision: payload.ifRevision
    };
    const guard = guardRevision(this.service, payload.ifRevision, meta);
    if (guard) return guard;
    return this.runWithoutRevisionGuard(() => {
      const report = createApplyReport();
      const projectMode = resolveProjectMode(payload.projectMode);
      if (payload.model) {
        const action = resolveProjectAction(this.service, payload.model.format, projectMode, meta);
        if (!action.ok) return action;
        const modelPayload: ApplyModelSpecPayload = {
          model: payload.model,
          textures: payload.imports,
          ifRevision: payload.ifRevision
        };
        const modelRes = applyModelSpecSteps(this.service, this.log, modelPayload, report, meta, {
          createProject: action.data.action === 'create'
        });
        if (!modelRes.ok) return modelRes;
      } else {
        if (projectMode === 'create') {
          return err('invalid_payload', 'projectMode=create requires model');
        }
        const activeCheck = ensureActiveProject(this.service, meta);
        if (!activeCheck.ok) return activeCheck;
        if (payload.imports && payload.imports.length > 0) {
          const importRes = applyTextureImports(this.service, payload.imports, report, meta);
          if (!importRes.ok) return importRes;
        }
      }
      if (payload.textures && payload.textures.length > 0) {
        const texRes = applyTextureSpecSteps(this.service, this.limits, payload.textures, report, meta);
        if (!texRes.ok) return texRes;
      }
      if (payload.animation) {
        const animRes = applyAnimSpecSteps(this.service, payload.animation, report, meta);
        if (!animRes.ok) return animRes;
      }
      this.log.info('applyProjectSpec applied', {
        model: Boolean(payload.model),
        imports: payload.imports?.length ?? 0,
        textures: payload.textures?.length ?? 0,
        animation: Boolean(payload.animation)
      });
      return { ok: true, data: withMeta({ applied: true, report }, meta, this.service) };
    });
  }

  handle(tool: ProxyTool, payload: unknown): ToolResponse<unknown> {
    try {
      switch (tool) {
        case 'apply_model_spec':
          return this.applyModelSpec(payload as ApplyModelSpecPayload);
        case 'apply_texture_spec':
          return this.applyTextureSpec(payload as ApplyTextureSpecPayload);
        case 'apply_anim_spec':
          return this.applyAnimSpec(payload as ApplyAnimSpecPayload);
        case 'apply_project_spec':
          return this.applyProjectSpec(payload as ApplyProjectSpecPayload);
        case 'render_preview':
          return attachRenderPreviewContent(
            toToolResponse(this.service.renderPreview(payload as RenderPreviewPayload))
          );
        case 'validate':
          return toToolResponse(this.service.validate());
        default:
          return { ok: false, error: { code: 'unknown', message: `Unknown proxy tool ${tool}` } };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.log.error('proxy handle error', { tool, message });
      return { ok: false, error: { code: 'unknown', message } };
    }
  }

  private runWithoutRevisionGuard<T>(fn: () => T): T {
    const runner = (this.service as { runWithoutRevisionGuard?: (inner: () => T) => T }).runWithoutRevisionGuard;
    if (typeof runner === 'function') return runner.call(this.service, fn);
    return fn();
  }
}

const attachRenderPreviewContent = (
  response: ToolResponse<RenderPreviewResult>
): ToolResponse<RenderPreviewResult> => {
  if (!response.ok) return response;
  const content = buildRenderPreviewContent(response.data);
  const structuredContent = buildRenderPreviewStructured(response.data);
  if (!content.length) {
    return { ...response, structuredContent };
  }
  return { ...response, content, structuredContent };
};
