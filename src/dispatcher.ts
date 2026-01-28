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
import { askUser, callTool, readResource, refTool, refUser } from './mcp/nextActions';
import { decideRevision } from './services/revisionGuard';
import { attachStateToResponse } from './services/attachState';
import { err, toToolResponse } from './services/toolResponse';
import { guardOptionalRevision } from './services/optionalRevision';
import { ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED } from './shared/messages';

const respondOk = <T>(data: T): ToolResponse<T> => ({ ok: true, data });
const respondErrorSimple = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResponse<never> => err(code, message, details);

type BaseResult<K extends ToolName> = K extends ToolName
  ? ToolResultMap[K] extends WithState<infer R>
    ? R
    : ToolResultMap[K]
  : never;

type HandlerPayload = ToolPayloadMap[ToolName];
type HandlerResult = ToolResultMap[ToolName];
type Handler = {
  bivarianceHack(payload: HandlerPayload): ToolResponse<HandlerResult>;
}['bivarianceHack'];

const STATEFUL_TOOL_NAMES = [
  'generate_texture_preset',
  'auto_uv_atlas',
  'set_project_texture_resolution',
  'ensure_project',
  'block_pipeline',
  'delete_texture',
  'assign_texture',
  'set_face_uv',
  'add_bone',
  'update_bone',
  'delete_bone',
  'add_cube',
  'update_cube',
  'delete_cube',
  'export',
  'validate',
  'render_preview'
] as const;

type StatefulToolName = typeof STATEFUL_TOOL_NAMES[number];

const isStatefulToolName = (name: ToolName): name is StatefulToolName =>
  (STATEFUL_TOOL_NAMES as readonly string[]).includes(name);

type StatefulHandlerMap = Partial<{
  [K in StatefulToolName]: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>;
}>;

type ResponseHandlerMap = Partial<{
  [K in ToolName]: (payload: ToolPayloadMap[K]) => ToolResponse<ToolResultMap[K]>;
}>;

export class ToolDispatcherImpl implements Dispatcher {
  private readonly service: ToolService;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;
  private readonly log: Logger;
  private readonly statefulRetryHandlers: StatefulHandlerMap;
  private readonly statefulHandlers: StatefulHandlerMap;
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
        policies: { snapshotPolicy: 'hybrid', exportPolicy: 'strict' }
      });
    }
    this.statefulRetryHandlers = {
      generate_texture_preset: (payload) => this.service.generateTexturePreset(payload),
      auto_uv_atlas: (payload) => this.service.autoUvAtlas(payload),
      set_project_texture_resolution: (payload) => this.service.setProjectTextureResolution(payload),
      ensure_project: (payload) => this.service.ensureProject(payload),
      block_pipeline: (payload) => this.service.blockPipeline(payload),
      delete_texture: (payload) => this.service.deleteTexture(payload),
      assign_texture: (payload) => this.service.assignTexture(payload),
      set_face_uv: (payload) => this.service.setFaceUv(payload),
      add_bone: (payload) => this.service.addBone(payload),
      update_bone: (payload) => this.service.updateBone(payload),
      delete_bone: (payload) => this.service.deleteBone(payload),
      add_cube: (payload) => this.service.addCube(payload),
      update_cube: (payload) => this.service.updateCube(payload),
      delete_cube: (payload) => this.service.deleteCube(payload)
    } satisfies StatefulHandlerMap;
    this.statefulHandlers = {
      export: (payload) => this.service.exportModel(payload),
      validate: (payload) => this.service.validate(payload)
    } satisfies StatefulHandlerMap;
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
          this.handleRenderPreview(payload)
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
  ): ToolResponse<ToolResultMap[TName]>;
  handle(name: ToolName, payload: HandlerPayload): ToolResponse<HandlerResult> {
    try {
      const handler = this.getHandler(name);
      if (handler) {
        return handler(payload);
      }
      return respondErrorSimple('invalid_payload', `Unknown tool ${String(name)}`, {
        reason: 'unknown_tool',
        tool: String(name)
      });
    } catch (err) {
      const message = errorMessage(err, 'unknown error');
      return respondErrorSimple('unknown', message, {
        reason: 'dispatcher_exception',
        tool: String(name)
      });
    }
  }

  private wrapRetryHandler<K extends StatefulToolName>(
    name: K,
    handler: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>
  ): Handler {
    return (payload) => this.handleWithRetry(name, payload as ToolPayloadMap[K], handler);
  }

  private wrapStatefulHandler<K extends StatefulToolName>(
    name: K,
    handler: (payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>
  ): Handler {
    return (payload) => this.handleStateful(name, payload as ToolPayloadMap[K], handler);
  }

  private getStatefulRetryHandler<K extends StatefulToolName>(
    name: K
  ): ((payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>) | undefined {
    return this.statefulRetryHandlers[name];
  }

  private getStatefulHandler<K extends StatefulToolName>(
    name: K
  ): ((payload: ToolPayloadMap[K]) => UsecaseResult<BaseResult<K>>) | undefined {
    return this.statefulHandlers[name];
  }

  private getHandler(name: ToolName): Handler | null {
    if (isStatefulToolName(name)) {
      const retryHandler = this.getStatefulRetryHandler(name);
      if (retryHandler) {
        return this.wrapRetryHandler(name, retryHandler);
      }
      const statefulHandler = this.getStatefulHandler(name);
      if (statefulHandler) {
        return this.wrapStatefulHandler(name, statefulHandler);
      }
    }
    const responseHandler = this.responseHandlers[name];
    if (responseHandler) {
      return responseHandler as Handler;
    }
    return null;
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

  private handleWithRetry<TName extends StatefulToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> {
    const { result, payload: retryPayload } = this.callWithAutoRetry(tool, payload, call);
    const response = this.attachStateForTool(retryPayload, toToolResponse(result));
    const withDialogActions =
      tool === 'ensure_project'
        ? attachEnsureProjectDialogNextActions(
            retryPayload as ToolPayloadMap['ensure_project'],
            response as ToolResponse<ToolResultMap['ensure_project']>
          )
        : response;
    return this.logGuardFailure(tool, retryPayload, withDialogActions);
  }

  private handleStateful<TName extends StatefulToolName>(
    tool: TName,
    payload: ToolPayloadMap[TName],
    call: (payload: ToolPayloadMap[TName]) => UsecaseResult<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> {
    const guard = guardOptionalRevision(this.service, toRevisionPayload(payload));
    if (guard) {
      return this.logGuardFailure(
        tool,
        payload,
        this.attachStateForTool(payload, guard)
      );
    }
    return this.logGuardFailure(
      tool,
      payload,
      this.attachStateForTool(payload, toToolResponse(call(payload)))
    );
  }

  private handleRenderPreview(
    payload: ToolPayloadMap['render_preview']
  ): ToolResponse<ToolResultMap['render_preview']> {
    const guard = guardOptionalRevision(this.service, toRevisionPayload(payload));
    if (guard) {
      return attachRenderPreviewContent(this.attachStateForTool<'render_preview'>(payload, guard));
    }
    const baseResponse = toToolResponse(this.service.renderPreview(payload));
    return attachRenderPreviewContent(this.attachStateForTool<'render_preview'>(payload, baseResponse));
  }

  private attachStateForTool<TName extends StatefulToolName>(
    payload: ToolPayloadMap[TName],
    response: ToolResponse<BaseResult<TName>>
  ): ToolResponse<ToolResultMap[TName]> {
    const attached = attachStateToResponse(this.getStateDeps(), payload, response);
    if (attached.ok) {
      return {
        ...attached,
        data: attached.data as ToolResultMap[TName]
      };
    }
    return {
      ok: false,
      error: attached.error,
      ...(attached.content ? { content: attached.content } : {}),
      ...(attached.structuredContent ? { structuredContent: attached.structuredContent } : {}),
      ...(attached.nextActions ? { nextActions: attached.nextActions } : {})
    };
  }


  private logGuardFailure<T>(
    tool: ToolName,
    payload: ToolPayloadMap[ToolName],
    response: ToolResponse<T>
  ): ToolResponse<T> {
    if (response.ok) return response;
    const reason = resolveGuardReason(response.error);
    if (!reason) return response;
    const ifRevision = resolveIfRevision(payload) ?? null;
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
    const ifRevision = resolveIfRevision(payload);
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

const resolveIfRevision = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  return typeof record.ifRevision === 'string' ? record.ifRevision : undefined;
};

const toRevisionPayload = (payload: unknown): { ifRevision?: string } | undefined => {
  const ifRevision = resolveIfRevision(payload);
  return ifRevision ? { ifRevision } : undefined;
};

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

function attachEnsureProjectDialogNextActions(
  payload: ToolPayloadMap['ensure_project'],
  response: ToolResponse<ToolResultMap['ensure_project']>
): ToolResponse<ToolResultMap['ensure_project']> {
  if (response.ok) return response;
  if (response.error.message !== ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED) return response;
  const missingRaw = response.error.details?.missing;
  const missing = Array.isArray(missingRaw) ? missingRaw.filter((item) => typeof item === 'string') : [];
  const missingHint = missing.length > 0 ? missing.join(', ') : 'required fields';
  const fieldsRaw = response.error.details?.fields;
  const fields = fieldsRaw && typeof fieldsRaw === 'object' ? (fieldsRaw as Record<string, unknown>) : null;
  const missingSnapshot =
    fields && missing.length > 0
      ? ` Current values: ${JSON.stringify(Object.fromEntries(missing.map((key) => [key, fields[key]])))}.`
      : '';
  const actions = [
    callTool('get_project_state', { detail: 'summary' }, 'Get latest ifRevision before retrying project creation.', 1),
    askUser(
      `Provide ensure_project.dialog values for: ${missingHint}.${missingSnapshot} Reply with a JSON object only. (Example: {"format":"<id>","parent":"<id>"})`,
      'Project dialog requires input.',
      2
    ),
    callTool(
      'ensure_project',
      {
        ...payload,
        confirmDialog: true,
        dialog: refUser(`dialog values for ${missingHint}`),
        ifRevision: refTool('get_project_state', '/project/revision')
      },
      'Retry ensure_project with dialog values.',
      3
    )
  ];
  return { ...response, nextActions: actions };
}
