import {
  type ToolError,
  type ToolName,
  type ToolPayloadMap,
  type ToolResponse,
  type ToolResultMap
} from '@ashfox/contracts/types/internal';
import {
  backendToolError,
  isMutatingTool,
  type BackendToolContext,
  type PersistedProjectRecord,
  type PersistencePorts,
  type ProjectRepositoryScope
} from '@ashfox/backend-core';
import { ProjectSession } from '../../../runtime/src/session';
import type { SessionState } from '../../../runtime/src/session/types';
import { ToolDispatcherImpl } from '../../../runtime/src/dispatcher';
import { ToolService } from '../../../runtime/src/usecases/ToolService';
import { buildEngineCapabilities } from './capabilities';
import { EngineEditorAdapter } from './editorAdapter';
import { flushPendingWrites, persistProjectState } from './persistenceIo';
import { hasProjectData, loadPersistedState, toPersistenceEnvelope } from './persistenceState';
import { ENGINE_TMP_STORE, EngineExportPort, EngineFormatPort, EngineSnapshotPort } from './runtimePorts';

const toToolErrorResponse = <TName extends ToolName>(error: ToolError): ToolResponse<ToolResultMap[TName]> =>
  ({ ok: false, error }) as ToolResponse<ToolResultMap[TName]>;

const resolveScope = (context: BackendToolContext): ProjectRepositoryScope => ({
  tenantId: context.session.tenantId,
  projectId: context.session.projectId
});

const loadRecord = async <TName extends ToolName>(params: {
  persistence: PersistencePorts;
  scope: ProjectRepositoryScope;
  backendKind: string;
}): Promise<PersistedProjectRecord | ToolResponse<ToolResultMap[TName]> | null> => {
  const { persistence, scope, backendKind } = params;
  try {
    return await persistence.projectRepository.find(scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return backendToolError(
      'io_error',
      `Failed to load project state: ${message}`,
      'Check persistence repository health and retry.',
      { backend: backendKind, scope }
    ) as ToolResponse<ToolResultMap[TName]>;
  }
};

const dispatchTool = async <TName extends ToolName>(params: {
  dispatcher: ToolDispatcherImpl;
  name: TName;
  payload: ToolPayloadMap[TName];
  backendKind: string;
  scope: ProjectRepositoryScope;
}): Promise<ToolResponse<ToolResultMap[TName]>> => {
  const { dispatcher, name, payload, backendKind, scope } = params;
  try {
    return await dispatcher.handle(name, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return backendToolError(
      'unknown',
      `Engine backend execution failed: ${message}`,
      'Inspect engine backend logs and retry.',
      { backend: backendKind, scope, tool: name }
    ) as ToolResponse<ToolResultMap[TName]>;
  }
};

export const executeEngineTool = async <TName extends ToolName>(params: {
  name: TName;
  payload: ToolPayloadMap[TName];
  context: BackendToolContext;
  backendKind: string;
  persistence: PersistencePorts;
  revisionHash: (state: SessionState) => string;
}): Promise<ToolResponse<ToolResultMap[TName]>> => {
  const { name, payload, context, backendKind, persistence, revisionHash } = params;
  const scope = resolveScope(context);
  const recordResult = await loadRecord<TName>({
    persistence,
    scope,
    backendKind
  });
  if (recordResult && 'ok' in recordResult) {
    return recordResult as ToolResponse<ToolResultMap[TName]>;
  }
  const record = recordResult as PersistedProjectRecord | null;

  const loaded = loadPersistedState(record);
  const session = new ProjectSession();
  if (hasProjectData(loaded.session)) {
    const attach = session.attach(loaded.session);
    if (!attach.ok) {
      return toToolErrorResponse<TName>(attach.error);
    }
  }

  const editor = new EngineEditorAdapter(session, {
    textureResolution: loaded.textureResolution,
    textureUsage: loaded.textureUsage,
    textureAssets: loaded.textureAssets
  });
  const formats = new EngineFormatPort(session);
  const snapshot = new EngineSnapshotPort(session);
  const exporter = new EngineExportPort(session, (path, contents) => editor.writeFile(path, contents));
  const nativeCodecs = typeof exporter.listNativeCodecs === 'function' ? exporter.listNativeCodecs() : [];
  const capabilities = buildEngineCapabilities(formats, nativeCodecs);
  const service = new ToolService({
    session,
    capabilities,
    editor,
    formats,
    snapshot,
    exporter,
    tmpStore: ENGINE_TMP_STORE,
    policies: {
      snapshotPolicy: 'session',
      exportPolicy: 'best_effort',
      autoCreateProjectTexture: false,
      allowRenderPreview: false
    }
  });
  const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
    includeStateByDefault: false,
    includeDiffByDefault: false
  });

  const response = await dispatchTool({
    dispatcher,
    name,
    payload,
    backendKind,
    scope
  });

  const writeError = await flushPendingWrites({
    persistence,
    scope,
    writes: editor.drainPendingWrites(),
    backend: backendKind
  });
  if (writeError) {
    return writeError as ToolResponse<ToolResultMap[TName]>;
  }

  if (!response.ok || !isMutatingTool(name)) {
    return response;
  }

  const persistedSession = session.snapshot();
  const persistError = await persistProjectState({
    persistence,
    scope,
    existing: record,
    revision: revisionHash(persistedSession),
    hasProjectData: hasProjectData(persistedSession),
    state: toPersistenceEnvelope(persistedSession, editor),
    backend: backendKind
  });
  if (persistError) {
    return persistError as ToolResponse<ToolResultMap[TName]>;
  }

  return response;
};
