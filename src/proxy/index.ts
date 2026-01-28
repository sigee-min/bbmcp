import { Logger } from '../logging';
import { Limits, ProjectStateDetail, ToolResponse } from '../types';
import {
  ApplyTextureSpecPayload,
  ApplyUvSpecPayload,
  EntityPipelinePayload,
  ProxyTool,
  TexturePipelinePayload
} from '../spec';
import { ToolService } from '../usecases/ToolService';
import type { DomPort } from '../ports/dom';
import { err } from '../services/toolResponse';
import { modelPipelineProxy } from './modelPipeline';
import { applyTextureSpecProxy, applyUvSpecProxy, texturePipelineProxy } from './texturePipeline';
import type { ProxyPipelineDeps, ProxyToolPayloadMap, ProxyToolResultMap } from './types';
import { entityPipelineProxy } from './entityPipeline';
import { attachStateToResponse } from '../services/attachState';
import { runPreviewStep } from './previewStep';
import { runUsecaseWithOptionalRevision, runWithOptionalRevision } from './optionalRevision';
import { attachPreviewResponse } from './previewResponse';
import { createProxyPipelineCache } from './cache';
import { PROXY_TOOL_UNKNOWN } from '../shared/messages';
import { isResponseError } from './guardHelpers';

export class ProxyRouter {
  private readonly service: ToolService;
  private readonly dom: DomPort;
  private readonly log: Logger;
  private readonly limits: Limits;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;
  private readonly proxyHandlers: {
    [K in ProxyTool]: (payload: ProxyToolPayloadMap[K]) => Promise<ToolResponse<ProxyToolResultMap[K]>>;
  };

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
    this.proxyHandlers = {
      apply_texture_spec: async (payload) => this.applyTextureSpec(payload),
      apply_uv_spec: async (payload) => this.applyUvSpec(payload),
      model_pipeline: async (payload) => modelPipelineProxy(this.getPipelineDeps(), payload),
      texture_pipeline: async (payload) => this.texturePipeline(payload),
      entity_pipeline: async (payload) => this.entityPipeline(payload),
      render_preview: async (payload) =>
        attachStateToResponse(
          this.getStateDeps(),
          payload,
          runWithOptionalRevision(this.service, payload, () => {
            const previewRes = runPreviewStep(this.service, payload);
            if (isResponseError(previewRes)) return previewRes;
            return attachPreviewResponse({ ok: true, data: previewRes.data.data }, previewRes.data);
          })
        ),
      validate: async (payload) =>
        attachStateToResponse(
          this.getStateDeps(),
          payload,
          runUsecaseWithOptionalRevision(this.service, payload, () => this.service.validate(payload))
        )
    };
  }

  async applyTextureSpec(payload: ApplyTextureSpecPayload): Promise<ToolResponse<ProxyToolResultMap['apply_texture_spec']>> {
    return applyTextureSpecProxy(this.getPipelineDeps(), payload);
  }

  async applyUvSpec(payload: ApplyUvSpecPayload): Promise<ToolResponse<ProxyToolResultMap['apply_uv_spec']>> {
    return applyUvSpecProxy(this.getPipelineDeps(), payload);
  }

  async texturePipeline(payload: TexturePipelinePayload): Promise<ToolResponse<ProxyToolResultMap['texture_pipeline']>> {
    return texturePipelineProxy(this.getPipelineDeps(), payload);
  }

  async entityPipeline(payload: EntityPipelinePayload): Promise<ToolResponse<ProxyToolResultMap['entity_pipeline']>> {
    return entityPipelineProxy(this.getPipelineDeps(), payload);
  }

  async handle<K extends ProxyTool>(
    tool: K,
    payload: ProxyToolPayloadMap[K]
  ): Promise<ToolResponse<ProxyToolResultMap[K]>> {
    try {
      const handler =
        this.proxyHandlers[tool] as
          | ((payload: ProxyToolPayloadMap[K]) => Promise<ToolResponse<ProxyToolResultMap[K]>>)
          | undefined;
      if (!handler) {
        return err('invalid_payload', PROXY_TOOL_UNKNOWN(tool), { reason: 'unknown_proxy_tool', tool });
      }
      return await handler(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.log.error('proxy handle error', { tool, message });
      return err('unknown', message, { reason: 'proxy_exception', tool });
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
      runWithoutRevisionGuard: (fn) => this.runWithoutRevisionGuard(fn),
      cache: createProxyPipelineCache()
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
