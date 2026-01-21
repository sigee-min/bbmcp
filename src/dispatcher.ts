import {
  Dispatcher,
  ProjectDiff,
  ProjectState,
  ProjectStateDetail,
  RenderPreviewResult,
  ToolError,
  ToolName,
  ToolPayloadMap,
  ToolResultMap,
  ToolResponse,
  ToolErrorCode
} from './types';
import { ProjectSession } from './session';
import { Capabilities } from './types';
import { ConsoleLogger } from './logging';
import { BlockbenchEditor } from './adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from './adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from './adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from './adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from './adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from './adapters/blockbench/BlockbenchTextureRenderer';
import { ToolService } from './usecases/ToolService';
import { UsecaseResult } from './usecases/result';
import {
  buildRenderPreviewContent,
  buildRenderPreviewStructured,
  buildTextureContent,
  buildTextureStructured
} from './mcp/content';

const respondOk = <T>(data: T): ToolResponse<T> => ({ ok: true, data });
const respondError = <T>(error: ToolError): ToolResponse<T> => ({ ok: false, error });
const respondErrorSimple = (
  code: ToolErrorCode,
  message: string,
  details?: Record<string, unknown>
): ToolResponse<unknown> => respondError({ code, message, details });

export class ToolDispatcherImpl implements Dispatcher {
  private readonly service: ToolService;
  private readonly includeStateByDefault: () => boolean;
  private readonly includeDiffByDefault: () => boolean;

  constructor(
    session: ProjectSession,
    capabilities: Capabilities,
    service?: ToolService,
    options?: { includeStateByDefault?: boolean | (() => boolean); includeDiffByDefault?: boolean | (() => boolean) }
  ) {
    if (service) {
      this.service = service;
    } else {
      const log = new ConsoleLogger('bbmcp-dispatcher', 'info');
      const editor = new BlockbenchEditor(log);
      const host = new BlockbenchHost();
      const formats = new BlockbenchFormats();
      const snapshot = new BlockbenchSnapshot(log);
      const exporter = new BlockbenchExport(log);
      const textureRenderer = new BlockbenchTextureRenderer();
      this.service = new ToolService({
        session,
        capabilities,
        editor,
        host,
        formats,
        snapshot,
        exporter,
        textureRenderer,
        policies: { snapshotPolicy: 'hybrid', rigMergeStrategy: 'skip_existing', exportPolicy: 'strict' }
      });
    }
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
      switch (name) {
        case 'list_capabilities':
          return respondOk(this.service.listCapabilities()) as ToolResponse<ToolResultMap[TName]>;
        case 'get_project_state':
          return toToolResponse(this.service.getProjectState(payload)) as ToolResponse<ToolResultMap[TName]>;
        case 'read_texture':
          return attachTextureContent(
            toToolResponse(this.service.readTextureImage(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'reload_plugins':
          return toToolResponse(this.service.reloadPlugins(payload)) as ToolResponse<ToolResultMap[TName]>;
        case 'generate_texture_preset':
          return this.attachState(
            payload,
            toToolResponse(this.service.generateTexturePreset(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'set_project_texture_resolution':
          return this.attachState(
            payload,
            toToolResponse(this.service.setProjectTextureResolution(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'preflight_texture':
          return toToolResponse(this.service.preflightTexture(payload)) as ToolResponse<ToolResultMap[TName]>;
        case 'ensure_project':
          return this.attachState(
            payload,
            toToolResponse(this.service.ensureProject(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'generate_block_pipeline':
          return this.attachState(
            payload,
            toToolResponse(this.service.generateBlockPipeline(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'delete_texture':
          return this.attachState(
            payload,
            toToolResponse(this.service.deleteTexture(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'assign_texture':
          return this.attachState(
            payload,
            toToolResponse(this.service.assignTexture(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'set_face_uv':
          return this.attachState(
            payload,
            toToolResponse(this.service.setFaceUv(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'add_bone':
          return this.attachState(
            payload,
            toToolResponse(this.service.addBone(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'update_bone':
          return this.attachState(
            payload,
            toToolResponse(this.service.updateBone(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'delete_bone':
          return this.attachState(
            payload,
            toToolResponse(this.service.deleteBone(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'add_cube':
          return this.attachState(
            payload,
            toToolResponse(this.service.addCube(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'update_cube':
          return this.attachState(
            payload,
            toToolResponse(this.service.updateCube(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'delete_cube':
          return this.attachState(
            payload,
            toToolResponse(this.service.deleteCube(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'apply_rig_template':
          return this.attachState(
            payload,
            toToolResponse(this.service.applyRigTemplate(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'export':
          return this.attachState(
            payload,
            toToolResponse(this.service.exportModel(payload))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'render_preview':
          return attachRenderPreviewContent(
            this.attachState(payload, toToolResponse(this.service.renderPreview(payload)))
          ) as ToolResponse<ToolResultMap[TName]>;
        case 'validate':
          return this.attachState(
            payload,
            toToolResponse(this.service.validate())
          ) as ToolResponse<ToolResultMap[TName]>;
        default:
          return respondErrorSimple('unknown', `Unknown tool ${String(name)}`) as ToolResponse<ToolResultMap[TName]>;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return respondErrorSimple('unknown', message) as ToolResponse<ToolResultMap[TName]>;
    }
  }

  private attachState<
    TPayload extends { includeState?: boolean; includeDiff?: boolean; diffDetail?: ProjectStateDetail; ifRevision?: string },
    TResult
  >(
    payload: TPayload,
    response: ToolResponse<TResult>
  ): ToolResponse<TResult & { state?: ProjectState | null; diff?: ProjectDiff | null }> {
    const shouldIncludeState = payload?.includeState ?? this.includeStateByDefault();
    const shouldIncludeDiff = payload?.includeDiff ?? this.includeDiffByDefault();
    const shouldIncludeRevision = true;
    if (!shouldIncludeState && !shouldIncludeDiff && !shouldIncludeRevision) {
      return response as ToolResponse<TResult & { state?: ProjectState | null; diff?: ProjectDiff | null }>;
    }
    const state = this.service.getProjectState({ detail: 'summary' });
    const project = state.ok ? state.value.project : null;
    const revision = project?.revision;
    let diffValue: ProjectDiff | null | undefined;
    if (shouldIncludeDiff) {
      if (payload?.ifRevision) {
        const diff = this.service.getProjectDiff({
          sinceRevision: payload.ifRevision,
          detail: payload.diffDetail ?? 'summary'
        });
        diffValue = diff.ok ? diff.value.diff : null;
      } else {
        diffValue = null;
      }
    }
    if (response.ok) {
      return {
        ok: true,
        ...(response.content ? { content: response.content } : {}),
        ...(response.structuredContent ? { structuredContent: response.structuredContent } : {}),
        data: {
          ...(response.data as Record<string, unknown>),
          ...(shouldIncludeRevision && revision ? { revision } : {}),
          ...(shouldIncludeState ? { state: project } : {}),
          ...(shouldIncludeDiff ? { diff: diffValue ?? null } : {})
        }
      };
    }
    const details: Record<string, unknown> = { ...(response.error.details ?? {}) };
    if (shouldIncludeRevision && revision) {
      details.revision = revision;
    }
    if (shouldIncludeState) {
      details.state = project;
    }
    if (shouldIncludeDiff) {
      details.diff = diffValue ?? null;
    }
    return {
      ok: false,
      ...(response.content ? { content: response.content } : {}),
      ...(response.structuredContent ? { structuredContent: response.structuredContent } : {}),
      error: { ...response.error, details }
    };
  }
}

function toToolResponse<T>(result: UsecaseResult<T>): ToolResponse<T> {
  if (result.ok) return respondOk(result.value);
  return respondError(result.error);
}

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
