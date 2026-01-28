import type { Capabilities } from '../types';
import { ProjectSession } from '../session';
import type { EditorPort } from '../ports/editor';
import type { FormatPort } from '../ports/formats';
import type { SnapshotPort } from '../ports/snapshot';
import type { ExportPort } from '../ports/exporter';
import type { HostPort } from '../ports/host';
import type { ResourceStore } from '../ports/resources';
import type { TextureRendererPort } from '../ports/textureRenderer';
import type { TmpStorePort } from '../ports/tmpStore';
import type { ToolPolicies } from './policies';
import { PolicyContext } from './PolicyContext';
import { SnapshotContext } from './SnapshotContext';
import { RevisionContext } from './RevisionContext';
import type { PolicyContextLike, RevisionContextLike, SnapshotContextLike } from './contextTypes';
import { ProjectStateService } from '../services/projectState';
import { RevisionStore } from '../services/revision';
import { ProjectService } from './ProjectService';
import { TextureService } from './TextureService';
import { AnimationService } from './AnimationService';
import { ModelService } from './ModelService';
import { ExportService } from './ExportService';
import { RenderService } from './RenderService';
import { ValidationService } from './ValidationService';
import { BlockPipelineService } from './BlockPipelineService';

const REVISION_CACHE_LIMIT = 5;

export interface ToolServiceDeps {
  session: ProjectSession;
  capabilities: Capabilities;
  editor: EditorPort;
  formats: FormatPort;
  snapshot: SnapshotPort;
  exporter: ExportPort;
  host?: HostPort;
  resources?: ResourceStore;
  textureRenderer?: TextureRendererPort;
  tmpStore?: TmpStorePort;
  policies?: ToolPolicies;
}

export type ToolServiceContext = {
  policyContext: PolicyContextLike;
  snapshotContext: SnapshotContextLike<ReturnType<ProjectSession['snapshot']>>;
  revisionContext: RevisionContextLike;
  projectService: ProjectService;
  textureService: TextureService;
  animationService: AnimationService;
  modelService: ModelService;
  exportService: ExportService;
  renderService: RenderService;
  validationService: ValidationService;
  blockPipelineService: BlockPipelineService;
};

export const createToolServiceContext = (deps: ToolServiceDeps): ToolServiceContext => {
  const policies = deps.policies ?? {};
  const projectState = new ProjectStateService(deps.formats, policies.formatOverrides);
  const revisionStore = new RevisionStore(REVISION_CACHE_LIMIT);
  const policyContext = new PolicyContext(policies);
  const snapshotContext = new SnapshotContext({
    session: deps.session,
    snapshotPort: deps.snapshot,
    projectState,
    policyContext
  });
  const revisionContext = new RevisionContext({
    revisionStore,
    projectState,
    snapshotContext,
    policyContext
  });
  const projectService = new ProjectService({
    session: deps.session,
    capabilities: deps.capabilities,
    editor: deps.editor,
    formats: deps.formats,
    projectState,
    revision: {
      track: (snapshot) => revisionStore.track(snapshot),
      hash: (snapshot) => revisionStore.hash(snapshot),
      get: (id) => revisionStore.get(id),
      remember: (snapshot, id) => revisionStore.remember(snapshot, id)
    },
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision),
    policies: {
      formatOverrides: policyContext.getFormatOverrides(),
      autoDiscardUnsaved: policyContext.getAutoDiscardUnsaved()
    }
  });
  const textureService = new TextureService({
    session: deps.session,
    editor: deps.editor,
    capabilities: deps.capabilities,
    textureRenderer: deps.textureRenderer,
    tmpStore: deps.tmpStore,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision),
    getUvPolicyConfig: () => policyContext.getUvPolicyConfig()
  });
  const animationService = new AnimationService({
    session: deps.session,
    editor: deps.editor,
    capabilities: deps.capabilities,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision)
  });
  const modelService = new ModelService({
    session: deps.session,
    editor: deps.editor,
    capabilities: deps.capabilities,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision)
  });
  const exportService = new ExportService({
    capabilities: deps.capabilities,
    editor: deps.editor,
    exporter: deps.exporter,
    formats: deps.formats,
    projectState,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    policies: {
      formatOverrides: policyContext.getFormatOverrides(),
      exportPolicy: policyContext.getExportPolicy()
    }
  });
  const renderService = new RenderService({
    editor: deps.editor,
    tmpStore: deps.tmpStore,
    ensureActive: () => snapshotContext.ensureActive()
  });
  const validationService = new ValidationService({
    editor: deps.editor,
    capabilities: deps.capabilities,
    ensureActive: () => snapshotContext.ensureActive(),
    getSnapshot: () => snapshotContext.getSnapshot(),
    getUvPolicyConfig: () => policyContext.getUvPolicyConfig()
  });
  const blockPipelineService = new BlockPipelineService({
    resources: deps.resources,
    createProject: (format, name, options) => projectService.createProject(format, name, options),
    runWithoutRevisionGuard: (fn) => revisionContext.runWithoutRevisionGuard(fn),
    addBone: (payload) => modelService.addBone(payload),
    addCube: (payload) => modelService.addCube(payload)
  });

  return {
    policyContext,
    snapshotContext,
    revisionContext,
    projectService,
    textureService,
    animationService,
    modelService,
    exportService,
    renderService,
    validationService,
    blockPipelineService
  };
};
