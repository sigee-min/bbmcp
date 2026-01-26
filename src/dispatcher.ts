import {
  Dispatcher,
  ProjectStateDetail,
  RenderPreviewResult,
  ToolError,
  ToolName,
  ToolPayloadMap,
  ToolResultMap,
  WithState,
  ToolResponse,
  ToolErrorCode
} from './types';
import { ProjectSession } from './session';
import { Capabilities } from './types';
import { ConsoleLogger, errorMessage, Logger } from './logging';
import { BlockbenchEditor } from './adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from './adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from './adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from './adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from './adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from './adapters/blockbench/BlockbenchTextureRenderer';
import { ToolService } from './usecases/ToolService';
import { UsecaseResult } from './usecases/result';
import { LocalTmpStore } from './services/tmpStore';
import {
  buildRenderPreviewContent,
  buildRenderPreviewStructured,
  buildTextureContent,
  buildTextureStructured
} from './mcp/content';
import { callTool, readResource, refTool } from './mcp/nextActions';
import { decideRevision } from './services/revisionGuard';
import { attachStateToResponse } from './services/attachState';
import { err, toToolResponse } from './services/toolResponse';

const respondOk = <T>(data: T): ToolResponse<T> => ({ ok: true, data });
const respondErrorSimple = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResponse<unknown> => err(code, message, details);

type BaseResult<K extends ToolName> = ToolResultMap[K] extends WithState<infer R> ? R : ToolResultMap[K];

type ToolHandlerMap = Partial<{
  [K in ToolName]: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>;
}>;

type ResponseHandlerMap = Partial<{
  [K in ToolName]: (payload: ToolPayloadMap[K]) => ToolResponse<ToolResultMap[K]>;
}>;

export class ToolDispatcherImpl implements Dispatcher {
  private readonly service: ToolService;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;
  private readonly log: Logger;
  private readonly statefulRetryHandlers: ToolHandlerMap;
  private readonly statefulHandlers: ToolHandlerMap;
  private readonly responseHandlers: ResponseHandlerMap;

  constructor(
    session: ProjectSession,
    capabilities: Capabilities,
    service?: ToolService,
    options?: {
      includeStateByDefault?: boolean | (() => boolean);
      includeDiffByDefault?: boolean | (() => boolean);
      logger?: Logger;
    }
  ) {
    this.log = options?.logger ?? new ConsoleLogger('bbmcp-dispatcher', 'info');
    if (service) {
      this.service = service;
    } else {
      const log = this.log;
      const editor = new BlockbenchEditor(log);
      const host = new BlockbenchHost();
      const formats = new BlockbenchFormats();
      const snapshot = new BlockbenchSnapshot(log);
      const exporter = new BlockbenchExport(log);
      const textureRenderer = new BlockbenchTextureRenderer();
      const tmpStore = new LocalTmpStore();
      this.service = new ToolService({
        session,
        capabilities,
        editor,
        host,
        formats,
        snapshot,
        exporter,
        textureRenderer,
        tmpStore,
        policies: { snapshotPolicy: 'hybrid', rigMergeStrategy: 'skip_existing', exportPolicy: 'strict' }
      });
    }
    this.statefulRetryHandlers = {
      generate_texture_preset: (payload) => this.service.generateTexturePreset(payload),
      auto_uv_atlas: (payload) => this.service.autoUvAtlas(payload),
      set_project_texture_resolution: (payload) => this.service.setProjectTextureResolution(payload),
      ensure_project: (payload) => this.service.ensureProject(payload),
      generate_block_pipeline: (payload) => this.service.generateBlockPipeline(payload),
      delete_texture: (payload) => this.service.deleteTexture(payload),
      assign_texture: (payload) => this.service.assignTexture(payload),
      set_face_uv: (payload) => this.service.setFaceUv(payload),
      add_bone: (payload) => this.service.addBone(payload),
      update_bone: (payload) => this.service.updateBone(payload),
      delete_bone: (payload) => this.service.deleteBone(payload),
      add_cube: (payload) => this.service.addCube(payload),
      update_cube: (payload) => this.service.updateCube(payload),
      delete_cube: (payload) => this.service.deleteCube(payload),
      apply_rig_template: (payload) => this.service.applyRigTemplate(payload)
    } satisfies ToolHandlerMap;
    this.statefulHandlers = {
      export: (payload) => this.service.exportModel(payload),
      validate: (payload) => this.service.validate(payload)
    } satisfies ToolHandlerMap;
    this.responseHandlers = {
      list_capabilities: () => respondOk(this.service.listCapabilities()),
      get_project_state: (payload) =>
        this.logGuardFailure(
          'get_project_state',
          payload,
          toToolResponse(this.service.getProjectState(payload))
        ),
      read_texture: (payload) =>
        this.logGuardFailure(
          'read_texture',
          payload,
          attachTextureContent(toToolResponse(this.service.readTextureImage(payload)))
        ),
      reload_plugins: (payload) =>
        this.logGuardFailure('reload_plugins', payload, toToolResponse(this.service.reloadPlugins(payload))),
      preflight_texture: (payload) =>
        this.logGuardFailure(
          'preflight_texture',
          payload,
          attachPreflightNextActions(toToolResponse(this.service.preflightTexture(payload)))
        ),
      render_preview: (payload) =>
        this.logGuardFailure(
          'render_preview',
          payload,
          attachRenderPreviewContent(
            attachStateToResponse(this.getStateDeps(), payload, toToolResponse(this.service.renderPreview(payload)))
          )
        )
    } satisfies ResponseHandlerMap;
    const flag = options?.includeStateByDefault;
    this.includeStateByDefault = typeof flag === 'function' ? flag : () => Boolean(flag);
    const diffFlag = options?.includeDiffByDefault;
    this.includeDiffByDefault = typeof diffFlag === 'function' ? diffFlag : () => Boolean(diffFlag);
  }

  handle<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ): ToolResponse<ToolResultMap[TName]> {
    try {
      const retryHandler = this.statefulRetryHandlers[name as keyof ToolHandlerMap];
      if (retryHandler) {
        return this.handleWithRetry(
          name,
          payload,
          retryHandler as (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
        ) as ToolResponse<ToolResultMap[TName]>;
      }
      const statefulHandler = this.statefulHandlers[name as keyof ToolHandlerMap];
      if (statefulHandler) {
        return this.handleStateful(
          name,
          payload,
          statefulHandler as (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
        ) as ToolResponse<ToolResultMap[TName]>;
      }
      const responseHandler = this.responseHandlers[name as keyof ResponseHandlerMap];
      if (responseHandler) {
        return (responseHandler as (payload: ToolPayloadMap[TName]) => ToolResponse<ToolResultMap[TName]>)(
          payload
        );
      }
      return respondErrorSimple('invalid_payload', `Unknown tool ${String(name)}`, {
        reason: 'unknown_tool',
        tool: String(name)
      }) as ToolResponse<ToolResultMap[TName]>;
    } catch (err) {
      const message = errorMessage(err, 'unknown error');
      return respondErrorSimple('unknown', message, {
        reason: 'dispatcher_exception',
        tool: String(name)
      }) as ToolResponse<ToolResultMap[TName]>;
    }
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

  private handleWithRetry<TName extends ToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> {
    const { result, payload: retryPayload } = this.callWithAutoRetry(tool, payload, call);
    return this.logGuardFailure(
      tool,
      retryPayload,
      attachStateToResponse(
        this.getStateDeps(),
        retryPayload as {
          includeState?: boolean;
          includeDiff?: boolean;
          diffDetail?: ProjectStateDetail;
          ifRevision?: string;
        },
        toToolResponse(result)
      )
    ) as ToolResponse<ToolResultMap[TName]>;
  }

  private handleStateful<TName extends ToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> {
    return this.logGuardFailure(
      tool,
      payload,
      attachStateToResponse(
        this.getStateDeps(),
        payload as {
          includeState?: boolean;
          includeDiff?: boolean;
          diffDetail?: ProjectStateDetail;
          ifRevision?: string;
        },
        toToolResponse(call(payload))
      )
    ) as ToolResponse<ToolResultMap[TName]>;
  }

  private logGuardFailure<T>(
    tool: ToolName,
    payload: ToolPayloadMap[ToolName],
    response: ToolResponse<T>
  ): ToolResponse<T> {
    if (response.ok) return response;
    const reason = resolveGuardReason(response.error);
    if (!reason) return response;
    const ifRevision = (payload as { ifRevision?: string }).ifRevision ?? null;
    const detailMeta = extractGuardMeta(response.error);
    this.log.debug('guard rejected request', {
      tool,
      reason,
      code: response.error.code,
      ifRevision,
      ...detailMeta
    });
    return response;
  }

  private callWithAutoRetry<TPayload extends object, TResult>(
    tool: ToolName,
    payload: TPayload,
    call: (payload: TPayload) => UsecaseResult<TResult>
  ): { result: UsecaseResult<TResult>; payload: TPayload } {
    const first = call(payload);
    if (first.ok) {
      return { result: first, payload };
    }
    if (!this.service.isAutoRetryRevisionEnabled()) {
      return { result: first, payload };
    }
    if (first.error.code !== 'invalid_state_revision_mismatch') {
      return { result: first, payload };
    }
    const ifRevision = (payload as { ifRevision?: string }).ifRevision;
    const decision = decideRevision(ifRevision, {
      requiresRevision: this.service.isRevisionRequired(),
      allowAutoRetry: true,
      getProjectState: () => this.service.getProjectState({ detail: 'summary' })
    });
    if (!decision.ok) {
      const reason = resolveGuardReason(decision.error) ?? 'state_unavailable';
      this.log.debug('revision retry skipped', { tool, reason, code: decision.error.code });
      return { result: first, payload };
    }
    if (decision.action !== 'retry') {
      this.log.debug('revision retry skipped', {
        tool,
        reason: 'no_new_revision',
        expected: ifRevision ?? null,
        current: decision.currentRevision ?? null
      });
      return { result: first, payload };
    }
    if (!decision.currentRevision || decision.currentRevision === ifRevision) {
      this.log.debug('revision retry skipped', {
        tool,
        reason: 'no_new_revision',
        expected: ifRevision ?? null,
        current: decision.currentRevision ?? null
      });
      return { result: first, payload };
    }
    this.log.info('revision retrying with latest revision', {
      tool,
      reason: 'revision_mismatch',
      expected: ifRevision ?? null,
      current: decision.currentRevision,
      attempt: 1
    });
    const retryPayload = { ...payload, ifRevision: decision.currentRevision } as TPayload;
    const retry = call(retryPayload);
    if (retry.ok) {
      this.log.info('revision retry succeeded', { tool, attempt: 1 });
    } else {
      this.log.warn('revision retry failed', {
        tool,
        attempt: 1,
        code: retry.error.code,
        message: retry.error.message
      });
    }
    return { result: retry, payload: retryPayload };
  }
}

const resolveGuardReason = (error: ToolError): string | null => {
  if (error.code === 'invalid_state_revision_mismatch') return 'revision_mismatch';
  const details = error.details as Record<string, unknown> | undefined;
  const reason = details?.reason;
  return typeof reason === 'string' ? reason : null;
};

const extractGuardMeta = (error: ToolError): Record<string, unknown> => {
  const details = error.details;
  if (!details || typeof details !== 'object') return {};
  const record = details as Record<string, unknown>;
  const meta: Record<string, unknown> = {};
  if (typeof record.expected === 'string') meta.expected = record.expected;
  if (typeof record.currentRevision === 'string') meta.currentRevision = record.currentRevision;
  if (typeof record.current === 'string') meta.currentRevision = record.current;
  if (typeof record.active === 'boolean') meta.active = record.active;
  if (typeof record.reason === 'string') meta.reason = record.reason;
  return meta;
};

function attachRenderPreviewContent(
  response: ToolResponse<RenderPreviewResult>
): ToolResponse<RenderPreviewResult> {
  if (!response.ok) return response;
  const content = buildRenderPreviewContent(response.data);
  const structuredContent = buildRenderPreviewStructured(response.data);
  if (!content.length) {
    return { ...response, structuredContent };
  }
  return { ...response, content, structuredContent };
}

function attachTextureContent(
  response: ToolResponse<ToolResultMap['read_texture']>
): ToolResponse<ToolResultMap['read_texture']> {
  if (!response.ok) return response;
  const content = buildTextureContent(response.data);
  const structuredContent = buildTextureStructured(response.data);
  if (!content.length) {
    return { ...response, structuredContent };
  }
  return { ...response, content, structuredContent };
}

function attachPreflightNextActions(
  response: ToolResponse<ToolResultMap['preflight_texture']>
): ToolResponse<ToolResultMap['preflight_texture']> {
  if (!response.ok) return response;

  const warnings = response.data.warnings ?? [];
  if (!Array.isArray(warnings) || warnings.length === 0) return response;

  const joined = warnings.join(' ');
  const actions = [
    readResource('bbmcp://guide/llm-texture-strategy', 'Warnings present. Review the recovery playbook before painting.', 1)
  ];

  if (joined.includes('UV overlap') || joined.includes('UV scale mismatch')) {
    actions.push(
      callTool('get_project_state', { detail: 'summary' }, 'Get latest ifRevision for recovery tools.', 2),
      callTool(
        'auto_uv_atlas',
        { apply: true, ifRevision: refTool('get_project_state', '/project/revision') },
        'Recover from overlap/scale issues by repacking UVs (apply=true), then repaint.',
        3
      ),
      callTool('preflight_texture', { includeUsage: false }, 'Refresh uvUsageId after recovery.', 4)
    );
  }

  return { ...response, nextActions: actions };
}
