import { Logger } from '../logging';
import {
  Limits,
  ProjectStateDetail,
  RenderPreviewPayload,
  RenderPreviewResult,
  ToolPayloadMap,
  ToolResponse
} from '../types';
import {
  ApplyEntitySpecPayload,
  ApplyModelSpecPayload,
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  ProxyTool,
  TexturePipelinePayload
} from '../spec';
import { ToolService } from '../usecases/ToolService';
import type { DomPort } from '../ports/dom';
import { buildRenderPreviewContent, buildRenderPreviewStructured } from '../mcp/content';
import { callTool } from '../mcp/nextActions';
import { applyModelSpecSteps, createApplyReport } from './apply';
import { err, toToolResponse } from '../services/toolResponse';
import { validateModelSpec } from './validators';
import { createProxyPipeline } from './pipeline';
import { applyTextureSpecProxy, applyUvSpecProxy, texturePipelineProxy, type ProxyPipelineDeps } from './texturePipeline';
import { applyEntitySpecProxy } from './entityPipeline';
import { attachStateToResponse } from '../services/attachState';

export class ProxyRouter {
  private readonly service: ToolService;
  private readonly dom: DomPort;
  private readonly log: Logger;
  private readonly limits: Limits;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;

  constructor(
    service: ToolService,
    dom: DomPort,
    log: Logger,
    limits: Limits,
    options?: { includeStateByDefault?: boolean | (() => boolean); includeDiffByDefault?: boolean | (() => boolean) }
  ) {
    this.service = service;
    this.dom = dom;
    this.log = log;
    this.limits = limits;
    const flag = options?.includeStateByDefault;
    this.includeStateByDefault = typeof flag === 'function' ? flag : () => Boolean(flag);
    const diffFlag = options?.includeDiffByDefault;
    this.includeDiffByDefault = typeof diffFlag === 'function' ? diffFlag : () => Boolean(diffFlag);
  }

  async applyModelSpec(payload: ApplyModelSpecPayload): Promise<ToolResponse<unknown>> {
    const v = validateModelSpec(payload, this.limits);
    if (!v.ok) return v;
    const pipeline = createProxyPipeline({
      service: this.service,
      payload,
      includeStateByDefault: this.includeStateByDefault,
      includeDiffByDefault: this.includeDiffByDefault,
      runWithoutRevisionGuard: (fn) => this.runWithoutRevisionGuard(fn)
    });
    const revisionError = pipeline.guardRevision();
    if (revisionError) return revisionError;
    return pipeline.run(() => {
      const report = createApplyReport();
      const result = applyModelSpecSteps(this.service, this.log, payload, report, pipeline.meta);
      if (!result.ok) return result;
      const response = pipeline.ok({ applied: true, report });
      return {
        ...response,
        nextActions: [
          callTool(
            'render_preview',
            { mode: 'fixed', output: 'single', angle: [30, 45, 0] },
            'Render a quick preview to validate the rig visually.',
            1
          ),
          callTool('preflight_texture', { includeUsage: false }, 'Build a UV mapping table before painting textures.', 2)
        ]
      };
    });
  }

  async applyTextureSpec(payload: ApplyTextureSpecPayload): Promise<ToolResponse<unknown>> {
    return applyTextureSpecProxy(this.getPipelineDeps(), payload);
  }

  async applyUvSpec(payload: ApplyUvSpecPayload): Promise<ToolResponse<unknown>> {
    return applyUvSpecProxy(this.getPipelineDeps(), payload);
  }

  async texturePipeline(payload: TexturePipelinePayload): Promise<ToolResponse<unknown>> {
    return texturePipelineProxy(this.getPipelineDeps(), payload);
  }

  async applyEntitySpec(payload: ApplyEntitySpecPayload): Promise<ToolResponse<unknown>> {
    return applyEntitySpecProxy(this.getPipelineDeps(), payload);
  }

  async handle(tool: ProxyTool, payload: unknown): Promise<ToolResponse<unknown>> {
    try {
      switch (tool) {
        case 'apply_model_spec':
          return await this.applyModelSpec(payload as ApplyModelSpecPayload);
        case 'apply_texture_spec':
          return await this.applyTextureSpec(payload as ApplyTextureSpecPayload);
        case 'apply_uv_spec':
          return await this.applyUvSpec(payload as ApplyUvSpecPayload);
        case 'texture_pipeline':
          return await this.texturePipeline(payload as TexturePipelinePayload);
        case 'apply_entity_spec':
          return await this.applyEntitySpec(payload as ApplyEntitySpecPayload);
        case 'render_preview':
          return attachRenderPreviewContent(
            attachStateToResponse(
              this.getStateDeps(),
              payload as RenderPreviewPayload,
              toToolResponse(this.service.renderPreview(payload as RenderPreviewPayload))
            )
          );
        case 'validate':
          return attachStateToResponse(
            this.getStateDeps(),
            payload as ToolPayloadMap['validate'],
            toToolResponse(this.service.validate(payload as ToolPayloadMap['validate']))
          );
        default:
          return err('unknown', `Unknown proxy tool ${tool}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.log.error('proxy handle error', { tool, message });
      return err('unknown', message);
    }
  }

  private async runWithoutRevisionGuard<T>(fn: () => Promise<T> | T): Promise<T> {
    const service = this.service as {
      runWithoutRevisionGuardAsync?: (inner: () => Promise<T>) => Promise<T>;
    };
    if (typeof service.runWithoutRevisionGuardAsync === 'function') {
      return service.runWithoutRevisionGuardAsync(async () => await fn());
    }
    return await fn();
  }

  private getPipelineDeps(): ProxyPipelineDeps {
    return {
      service: this.service,
      dom: this.dom,
      log: this.log,
      limits: this.limits,
      includeStateByDefault: this.includeStateByDefault,
      includeDiffByDefault: this.includeDiffByDefault,
      runWithoutRevisionGuard: (fn) => this.runWithoutRevisionGuard(fn)
    };
  }

  private getStateDeps() {
    return {
      includeStateByDefault: this.includeStateByDefault,
      includeDiffByDefault: this.includeDiffByDefault,
      getProjectState: (payload: { detail: ProjectStateDetail }) => this.service.getProjectState(payload),
      getProjectDiff: (payload: { sinceRevision: string; detail?: ProjectStateDetail }) =>
        this.service.getProjectDiff(payload)
    };
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
