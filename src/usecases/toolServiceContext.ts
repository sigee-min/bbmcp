import type { Capabilities } from '@ashfox/contracts/types/internal';
import { ProjectSession } from '../session';
import type { EditorPort } from '../ports/editor';
import type { FormatPort } from '../ports/formats';
import type { SnapshotPort } from '../ports/snapshot';
import type { ExportPort } from '../ports/exporter';
import type { HostPort } from '../ports/host';
import type { ResourceStore } from '../ports/resources';
import type { TextureRendererPort } from '../ports/textureRenderer';
import type { TmpStorePort } from '../ports/tmpStore';
import type { ViewportRefresherPort } from '../ports/viewportRefresher';
import type { ToolPolicies } from './policies';
import { PolicyContext } from './PolicyContext';
import { SnapshotContext } from './SnapshotContext';
import { RevisionContext } from './RevisionContext';
import type { PolicyContextLike, RevisionContextLike, SnapshotContextLike } from './contextTypes';
import { ProjectStateBuilder } from '../domain/project/projectStateBuilder';
import { RevisionStore } from '../domain/revision/revisionStore';
import { normalizePixelsPerBlock } from '../domain/uv/policy';
import { ProjectService } from './ProjectService';
import { TextureService } from './TextureService';
import { ModelService } from './ModelService';
import { AnimationService } from './AnimationService';
import { ExportService } from './ExportService';
import { RenderService } from './RenderService';
import { ValidationService } from './ValidationService';

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
  viewportRefresher?: ViewportRefresherPort;
  policies?: ToolPolicies;
}

export type ToolServiceContext = {
  policyContext: PolicyContextLike;
  snapshotContext: SnapshotContextLike<ReturnType<ProjectSession['snapshot']>>;
  revisionContext: RevisionContextLike;
  projectService: ProjectService;
  textureService: TextureService;
  modelService: ModelService;
  animationService: AnimationService;
  exportService: ExportService;
  renderService: RenderService;
  validationService: ValidationService;
};

export const createToolServiceContext = (deps: ToolServiceDeps): ToolServiceContext => {
  const policies = deps.policies ?? {};
  if (policies.animationTimePolicy) {
    deps.session.setAnimationTimePolicy(policies.animationTimePolicy);
  }
  const projectState = new ProjectStateBuilder(deps.formats, policies.formatOverrides);
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
  const resolveUvPolicyConfig = () => {
    const base = policyContext.getUvPolicyConfig();
    const snapshot = snapshotContext.getSnapshot();
    const projectPixels = normalizePixelsPerBlock(snapshot.uvPixelsPerBlock);
    return {
      ...base,
      pixelsPerBlock: projectPixels ?? base.pixelsPerBlock
    };
  };

  const textureService = new TextureService({
    session: deps.session,
    editor: deps.editor,
    capabilities: deps.capabilities,
    textureRenderer: deps.textureRenderer,
    tmpStore: deps.tmpStore,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision),
    getUvPolicyConfig: () => resolveUvPolicyConfig(),
    runWithoutRevisionGuard: (fn) => revisionContext.runWithoutRevisionGuard(fn)
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
    runWithoutRevisionGuard: (fn) => revisionContext.runWithoutRevisionGuard(fn),
    texture: {
      createBlankTexture: (payload) => textureService.createBlankTexture(payload)
    },
    policies: {
      formatOverrides: policyContext.getFormatOverrides(),
      autoDiscardUnsaved: policyContext.getAutoDiscardUnsaved(),
      autoCreateProjectTexture: policyContext.getAutoCreateProjectTexture(),
      uvPolicy: policyContext.getUvPolicyConfig()
    }
  });
  const modelService = new ModelService({
    session: deps.session,
    editor: deps.editor,
    capabilities: deps.capabilities,
    getSnapshot: () => snapshotContext.getSnapshot(),
    ensureActive: () => snapshotContext.ensureActive(),
    ensureRevisionMatch: (ifRevision?: string) => revisionContext.ensureRevisionMatch(ifRevision),
    autoUvAtlas: (payload) => textureService.autoUvAtlas(payload),
    runWithoutRevisionGuard: (fn) => revisionContext.runWithoutRevisionGuard(fn)
  });
  const animationService = new AnimationService({
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
    getUvPolicyConfig: () => resolveUvPolicyConfig()
  });

  return {
    policyContext,
    snapshotContext,
    revisionContext,
    projectService,
    textureService,
    modelService,
    animationService,
    exportService,
    renderService,
    validationService
  };
};




