import { buildGatewayApiUrl } from './gatewayApi';
export { isProjectStreamPayload } from './dashboardPayloadValidation';

export type DashboardStatus = 'loading' | 'empty' | 'success' | 'error';
export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
export type DashboardErrorCode = 'project_load_failed' | 'stream_unavailable';
export type UiErrorSeverity = 'info' | 'warning' | 'error';
export type UiErrorChannel = 'blocking' | 'panel' | 'inline';
export type UiErrorKind = 'network' | 'auth' | 'validation' | 'permission' | 'not_found' | 'conflict' | 'server' | 'unknown';

export interface UiErrorContract<TCode extends string = string> {
  code: TCode;
  kind: UiErrorKind;
  channel: UiErrorChannel;
  severity: UiErrorSeverity;
  fallback: string;
  dedupeKey?: string;
}

export interface WorkspaceCapabilities {
  canManageWorkspaceSettings: boolean;
}

export interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  defaultMemberRoleId: string;
  capabilities: WorkspaceCapabilities;
}

export interface ServiceWorkspaceSummary {
  workspaceId: string;
  name: string;
  defaultMemberRoleId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ServiceSearchMatchMode = 'exact' | 'prefix' | 'contains';
export type ServiceUsersSearchField = 'any' | 'accountId' | 'displayName' | 'email' | 'localLoginId' | 'githubLogin';
export type ServiceWorkspacesSearchField = 'any' | 'workspaceId' | 'name' | 'createdBy' | 'memberAccountId';

export interface ServiceSearchMeta<TField extends string> {
  q: string | null;
  field: TField;
  match: ServiceSearchMatchMode;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  total: number;
}

export interface ServiceUserWorkspaceMembershipSummary {
  accountId: string;
  workspaceId: string;
  roleIds: string[];
  joinedAt: string;
}

export interface WorkspaceRoleRecord {
  workspaceId: string;
  roleId: string;
  name: string;
  builtin: 'workspace_admin' | null;
  createdAt: string;
  updatedAt: string;
}

export const WORKSPACE_ADMIN_ROLE_NAME = '어드민';
export const WORKSPACE_MEMBER_ROLE_NAME = '유저';

export interface WorkspaceMemberRecord {
  workspaceId: string;
  accountId: string;
  roleIds: string[];
  joinedAt: string;
}

export interface WorkspaceMemberCandidateRecord {
  accountId: string;
  displayName: string;
  email: string;
  localLoginId: string | null;
  githubLogin: string | null;
  systemRoles: Array<'system_admin' | 'cs_admin'>;
}

export type WorkspaceAclScope = 'folder';

export interface WorkspaceAclRuleRecord {
  workspaceId: string;
  ruleId: string;
  scope?: WorkspaceAclScope;
  folderId: string | null;
  roleIds: string[];
  read: WorkspaceAclEffect;
  write: WorkspaceAclEffect;
  locked?: boolean;
  updatedAt: string;
}

export type WorkspaceFolderAclRecord = WorkspaceAclRuleRecord;

export type WorkspaceAclEffect = 'allow' | 'deny' | 'inherit';

export interface WorkspaceApiKeyRecord {
  workspaceId: string;
  keyId: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type SystemRole = 'system_admin' | 'cs_admin';

export const normalizeSystemRoles = (roles: readonly string[] | undefined): SystemRole[] => {
  const deduped = new Set<SystemRole>();
  for (const role of roles ?? []) {
    if (role === 'system_admin' || role === 'cs_admin') {
      deduped.add(role);
    }
  }
  return [...deduped];
};

export const isSystemManager = (roles: readonly string[] | undefined): boolean => {
  const normalized = normalizeSystemRoles(roles);
  return normalized.includes('system_admin') || normalized.includes('cs_admin');
};

export interface ServiceManagedAccountRecord {
  accountId: string;
  displayName: string;
  email: string;
  localLoginId: string | null;
  githubLogin: string | null;
  systemRoles: SystemRole[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSmtpSettingsView {
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  fromEmail: string | null;
  fromName: string | null;
  hasPassword: boolean;
  updatedAt: string;
}

export interface ServiceGithubAuthSettingsView {
  enabled: boolean;
  clientId: string | null;
  callbackUrl: string | null;
  scopes: string;
  hasClientSecret: boolean;
  updatedAt: string;
}

export interface ServiceSettingsView {
  smtp: ServiceSmtpSettingsView;
  githubAuth: ServiceGithubAuthSettingsView;
}

export interface ServiceApiKeyRecord {
  keyId: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type HierarchyKind = 'bone' | 'cube';
export type ActiveJobStatus = 'queued' | 'running' | 'completed' | 'failed' | null;
export type ProjectLockMode = 'mcp';
export type ProjectLockState = 'unlocked' | 'locked-by-self' | 'locked-by-other';

export interface ProjectLockSnapshot {
  ownerAgentId: string;
  ownerSessionId: string | null;
  token: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  mode: ProjectLockMode;
}

export interface HierarchyNode {
  id: string;
  name: string;
  kind: HierarchyKind;
  children: readonly HierarchyNode[];
}

export interface AnimationSummary {
  id: string;
  name: string;
  length: number;
  loop: boolean;
}

export interface ProjectStats {
  bones: number;
  cubes: number;
}

export type TextureFaceDirection = 'north' | 'east' | 'south' | 'west' | 'up' | 'down';

export interface TextureUvEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextureAtlasFaceRef {
  faceId: string;
  cubeId: string;
  cubeName: string;
  direction: TextureFaceDirection;
  rotationQuarter: 0 | 1 | 2 | 3;
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

export interface ProjectTextureAtlas {
  textureId: string;
  name: string;
  width: number;
  height: number;
  faceCount: number;
  imageDataUrl: string;
  faces: readonly TextureAtlasFaceRef[];
  uvEdges: readonly TextureUvEdge[];
}

export interface ProjectSnapshot {
  projectId: string;
  workspaceId?: string;
  name: string;
  parentFolderId: string | null;
  revision: number;
  hasGeometry: boolean;
  hierarchy: readonly HierarchyNode[];
  animations: readonly AnimationSummary[];
  stats: ProjectStats;
  textures: readonly ProjectTextureAtlas[];
  activeJobStatus?: ActiveJobStatus;
  projectLock?: ProjectLockSnapshot;
}

export interface ProjectFolderTreeNode {
  kind: 'folder';
  folderId: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
  children: readonly ProjectTreeNode[];
}

export interface ProjectLeafTreeNode {
  kind: 'project';
  projectId: string;
  name: string;
  parentFolderId: string | null;
  depth: number;
  activeJobStatus: ActiveJobStatus;
  lockState?: ProjectLockState;
  lockedBySelf?: boolean;
  lockOwnerAgentId?: string | null;
}

export type ProjectTreeNode = ProjectFolderTreeNode | ProjectLeafTreeNode;

export interface ProjectTreeSnapshot {
  maxFolderDepth: number;
  roots: readonly ProjectTreeNode[];
}

export interface ProjectStreamPayload {
  projectId: string;
  name?: string;
  parentFolderId?: string | null;
  revision: number;
  hasGeometry: boolean;
  hierarchy: readonly HierarchyNode[];
  animations: readonly AnimationSummary[];
  stats: ProjectStats;
  activeJobStatus?: ActiveJobStatus;
  projectLock?: ProjectLockSnapshot;
  textures?: readonly ProjectTextureAtlas[];
}

export interface ViewerState {
  yawDeg: number;
  pitchDeg: number;
}

export const INSPECTOR_TABS = [
  { id: 'hierarchy', label: '하이어라키' },
  { id: 'animations', label: '애니메이션' }
] as const;

export type InspectorTabId = (typeof INSPECTOR_TABS)[number]['id'];

export interface DashboardState {
  status: DashboardStatus;
  streamStatus: StreamStatus;
  errorCode: DashboardErrorCode | null;
  projects: readonly ProjectSnapshot[];
  projectIndexById: ReadonlyMap<string, number>;
  projectTree: ProjectTreeSnapshot;
  treeProjectPathById: ReadonlyMap<string, readonly number[]>;
  selectedProjectId: string | null;
  activeTab: InspectorTabId;
  viewer: ViewerState;
  lastAppliedRevision: number;
}

const EMPTY_TREE: ProjectTreeSnapshot = {
  maxFolderDepth: 3,
  roots: []
};
const EMPTY_PROJECT_INDEX = new Map<string, number>();
const EMPTY_TREE_PROJECT_PATH_INDEX = new Map<string, readonly number[]>();

const buildProjectIndexById = (projects: readonly ProjectSnapshot[]): ReadonlyMap<string, number> => {
  const index = new Map<string, number>();
  projects.forEach((project, projectIndex) => {
    index.set(project.projectId, projectIndex);
  });
  return index;
};

const buildTreeProjectPathById = (tree: ProjectTreeSnapshot): ReadonlyMap<string, readonly number[]> => {
  const index = new Map<string, readonly number[]>();
  const walk = (nodes: readonly ProjectTreeNode[], parentPath: readonly number[]) => {
    nodes.forEach((node, nodeIndex) => {
      const path = [...parentPath, nodeIndex];
      if (node.kind === 'project') {
        index.set(node.projectId, path);
        return;
      }
      walk(node.children, path);
    });
  };
  walk(tree.roots, []);
  return index;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const areProjectLocksEqual = (left: ProjectLockSnapshot | undefined, right: ProjectLockSnapshot | undefined): boolean => {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.ownerAgentId === right.ownerAgentId &&
    left.ownerSessionId === right.ownerSessionId &&
    left.token === right.token &&
    left.mode === right.mode &&
    left.expiresAt === right.expiresAt
  );
};

const resolveLockState = (lock: ProjectLockSnapshot | undefined): ProjectLockState =>
  lock ? 'locked-by-other' : 'unlocked';

const buildViewerState = (): ViewerState => ({
  yawDeg: 0,
  pitchDeg: 0
});

const getProjectById = (
  projects: readonly ProjectSnapshot[],
  projectId: string | null,
  projectIndexById?: ReadonlyMap<string, number>
): ProjectSnapshot | null => {
  if (!projectId) {
    return null;
  }
  if (projectIndexById) {
    const projectIndex = projectIndexById.get(projectId);
    if (projectIndex === undefined) {
      return null;
    }
    return projects[projectIndex] ?? null;
  }
  for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
    const project = projects[projectIndex];
    if (project?.projectId === projectId) {
      return project;
    }
  }
  return null;
};

const collectProjectIds = (nodes: readonly ProjectTreeNode[], output: string[]): void => {
  for (const node of nodes) {
    if (node.kind === 'project') {
      output.push(node.projectId);
      continue;
    }
    collectProjectIds(node.children, output);
  }
};

const getFirstProjectIdFromTree = (tree: ProjectTreeSnapshot): string | null => {
  const ids: string[] = [];
  collectProjectIds(tree.roots, ids);
  return ids[0] ?? null;
};

const resolveSelectedProjectId = (
  projects: readonly ProjectSnapshot[],
  tree: ProjectTreeSnapshot,
  preferredProjectId: string | null
): string | null => {
  if (preferredProjectId && projects.some((project) => project.projectId === preferredProjectId)) {
    return preferredProjectId;
  }
  const firstWithHierarchy = projects.find((project) => project.hierarchy.length > 0);
  if (firstWithHierarchy) {
    return firstWithHierarchy.projectId;
  }
  const firstByTree = getFirstProjectIdFromTree(tree);
  if (firstByTree && projects.some((project) => project.projectId === firstByTree)) {
    return firstByTree;
  }
  return projects[0]?.projectId ?? null;
};

export const createInitialDashboardState = (): DashboardState => ({
  status: 'loading',
  streamStatus: 'idle',
  errorCode: null,
  projects: [],
  projectIndexById: EMPTY_PROJECT_INDEX,
  projectTree: EMPTY_TREE,
  treeProjectPathById: EMPTY_TREE_PROJECT_PATH_INDEX,
  selectedProjectId: null,
  activeTab: 'hierarchy',
  viewer: buildViewerState(),
  lastAppliedRevision: -1
});

export const createErrorState = (code: DashboardErrorCode): DashboardState => ({
  status: 'error',
  streamStatus: 'idle',
  errorCode: code,
  projects: [],
  projectIndexById: EMPTY_PROJECT_INDEX,
  projectTree: EMPTY_TREE,
  treeProjectPathById: EMPTY_TREE_PROJECT_PATH_INDEX,
  selectedProjectId: null,
  activeTab: 'hierarchy',
  viewer: buildViewerState(),
  lastAppliedRevision: -1
});

export const applyDashboardError = (state: DashboardState, code: DashboardErrorCode): DashboardState => {
  if (state.projects.length === 0) {
    return createErrorState(code);
  }

  const selectedProject =
    getProjectById(state.projects, state.selectedProjectId, state.projectIndexById) ?? state.projects[0] ?? null;
  const selectedProjectId = selectedProject?.projectId ?? null;
  const shouldResetViewer = selectedProjectId !== state.selectedProjectId;

  return {
    ...state,
    status: 'success',
    errorCode: code,
    selectedProjectId,
    viewer: shouldResetViewer ? buildViewerState() : state.viewer,
    lastAppliedRevision: selectedProject?.revision ?? state.lastAppliedRevision
  };
};

export const createLoadedState = (
  projects: readonly ProjectSnapshot[],
  tree: ProjectTreeSnapshot,
  preferredProjectId: string | null = null
): DashboardState => {
  const projectIndexById = buildProjectIndexById(projects);
  const treeProjectPathById = buildTreeProjectPathById(tree);
  if (projects.length === 0) {
    return {
      status: 'empty',
      streamStatus: 'idle',
      errorCode: null,
      projects: [],
      projectIndexById,
      projectTree: tree,
      treeProjectPathById,
      selectedProjectId: null,
      activeTab: 'hierarchy',
      viewer: buildViewerState(),
      lastAppliedRevision: -1
    };
  }

  const selectedProjectId = resolveSelectedProjectId(projects, tree, preferredProjectId);
  const selectedProject = getProjectById(projects, selectedProjectId) ?? projects[0];
  return {
    status: 'success',
    streamStatus: 'idle',
    errorCode: null,
    projects,
    projectIndexById,
    projectTree: tree,
    treeProjectPathById,
    selectedProjectId: selectedProject?.projectId ?? null,
    activeTab: 'hierarchy',
    viewer: buildViewerState(),
    lastAppliedRevision: selectedProject?.revision ?? -1
  };
};

export const selectProject = (state: DashboardState, projectId: string): DashboardState => {
  const selectedProject = getProjectById(state.projects, projectId, state.projectIndexById);
  if (!selectedProject) {
    return state;
  }
  return {
    ...state,
    selectedProjectId: projectId,
    viewer: buildViewerState(),
    lastAppliedRevision: selectedProject.revision,
    streamStatus: 'connecting',
    errorCode: null
  };
};

export const replaceProjectTree = (
  state: DashboardState,
  projects: readonly ProjectSnapshot[],
  tree: ProjectTreeSnapshot
): DashboardState => {
  const projectIndexById = buildProjectIndexById(projects);
  const treeProjectPathById = buildTreeProjectPathById(tree);
  const selectedProjectId = resolveSelectedProjectId(projects, tree, state.selectedProjectId);
  const selectedProject = getProjectById(projects, selectedProjectId, projectIndexById);
  return {
    ...state,
    status: projects.length === 0 ? 'empty' : 'success',
    projects,
    projectIndexById,
    projectTree: tree,
    treeProjectPathById,
    selectedProjectId,
    errorCode: null,
    lastAppliedRevision: selectedProject?.revision ?? -1
  };
};

export const setActiveTab = (state: DashboardState, tabId: InspectorTabId): DashboardState => ({
  ...state,
  activeTab: tabId
});

export const markStreamConnecting = (state: DashboardState): DashboardState => ({
  ...state,
  streamStatus: 'connecting'
});

export const markStreamOpen = (state: DashboardState, projectId: string): DashboardState => {
  if (state.selectedProjectId !== projectId) {
    return state;
  }
  return {
    ...state,
    streamStatus: 'open',
    errorCode: state.errorCode === 'stream_unavailable' ? null : state.errorCode
  };
};

export const markStreamReconnecting = (state: DashboardState, projectId: string): DashboardState => {
  if (state.selectedProjectId !== projectId || state.status !== 'success') {
    return state;
  }
  return {
    ...state,
    streamStatus: 'reconnecting',
    errorCode: 'stream_unavailable'
  };
};

export const rotateViewer = (viewer: ViewerState, deltaX: number, deltaY: number): ViewerState => ({
  yawDeg: viewer.yawDeg + deltaX * 0.35,
  pitchDeg: clamp(viewer.pitchDeg - deltaY * 0.35, -75, 75)
});

export const shouldApplyStreamPayload = (state: DashboardState, payload: ProjectStreamPayload): boolean => {
  if (state.selectedProjectId === null) {
    return false;
  }
  if (payload.projectId !== state.selectedProjectId) {
    return false;
  }
  if (payload.revision > state.lastAppliedRevision) {
    return true;
  }
  const projectIndex = state.projectIndexById.get(payload.projectId);
  const current = projectIndex === undefined ? null : state.projects[projectIndex] ?? null;
  if (!current) {
    return true;
  }
  const currentJobStatus = current.activeJobStatus ?? null;
  const incomingJobStatus = payload.activeJobStatus ?? currentJobStatus;
  if (incomingJobStatus !== currentJobStatus) {
    return true;
  }
  const incomingLock = payload.projectLock ?? current.projectLock;
  if (!areProjectLocksEqual(current.projectLock, incomingLock)) {
    return true;
  }
  return false;
};

const upsertProject = (
  projects: readonly ProjectSnapshot[],
  projectIndexById: ReadonlyMap<string, number>,
  payload: ProjectStreamPayload
): {
  projects: readonly ProjectSnapshot[];
  projectIndexById: ReadonlyMap<string, number>;
} => {
  const projectIndex = projectIndexById.get(payload.projectId);
  if (projectIndex === undefined) {
    const nextProjects = [
      ...projects,
      {
        projectId: payload.projectId,
        name: payload.name ?? payload.projectId,
        parentFolderId: payload.parentFolderId ?? null,
        revision: payload.revision,
        hasGeometry: payload.hasGeometry,
        hierarchy: payload.hierarchy,
        animations: payload.animations,
        stats: payload.stats,
        activeJobStatus: payload.activeJobStatus ?? null,
        ...(payload.projectLock ? { projectLock: payload.projectLock } : {}),
        textures: payload.textures ?? []
      }
    ] as const;
    const nextProjectIndexById = new Map(projectIndexById);
    nextProjectIndexById.set(payload.projectId, projects.length);
    return {
      projects: nextProjects,
      projectIndexById: nextProjectIndexById
    };
  }

  const project = projects[projectIndex];
  if (!project) {
    return {
      projects,
      projectIndexById
    };
  }

  const nextProject: ProjectSnapshot = {
    ...project,
    name: payload.name ?? project.name,
    parentFolderId: payload.parentFolderId ?? project.parentFolderId,
    revision: payload.revision,
    hasGeometry: payload.hasGeometry,
    hierarchy: payload.hierarchy,
    animations: payload.animations,
    stats: payload.stats,
    activeJobStatus: payload.activeJobStatus ?? project.activeJobStatus ?? null,
    projectLock: payload.projectLock ?? project.projectLock,
    textures: payload.textures ?? project.textures
  };

  const nextProjects = [...projects];
  nextProjects[projectIndex] = nextProject;
  return {
    projects: nextProjects,
    projectIndexById
  };
};

export const applyProjectStreamPayload = (state: DashboardState, payload: ProjectStreamPayload): DashboardState => {
  if (!shouldApplyStreamPayload(state, payload)) {
    return state;
  }

  const nextProjects = upsertProject(state.projects, state.projectIndexById, payload);
  const nextTree = updateProjectTreeStatusFromStream(state.projectTree, state.treeProjectPathById, payload);
  return {
    ...state,
    projects: nextProjects.projects,
    projectIndexById: nextProjects.projectIndexById,
    projectTree: nextTree,
    streamStatus: 'open',
    errorCode: null,
    lastAppliedRevision: Math.max(payload.revision, state.lastAppliedRevision)
  };
};

const updateProjectTreeStatusFromStreamNode = (
  node: ProjectTreeNode,
  path: readonly number[],
  depth: number,
  payload: ProjectStreamPayload
): ProjectTreeNode => {
  if (depth === path.length - 1) {
    if (node.kind !== 'project' || node.projectId !== payload.projectId) {
      return node;
    }
    const nextLock = payload.projectLock;
    const nextActiveJobStatus = payload.activeJobStatus ?? node.activeJobStatus;
    const nextLockState = resolveLockState(nextLock);
    const nextLockOwnerAgentId = nextLock?.ownerAgentId ?? null;
    if (
      node.activeJobStatus === nextActiveJobStatus &&
      node.lockState === nextLockState &&
      node.lockedBySelf === false &&
      (node.lockOwnerAgentId ?? null) === nextLockOwnerAgentId
    ) {
      return node;
    }
    return {
      ...node,
      activeJobStatus: nextActiveJobStatus,
      lockState: nextLockState,
      lockedBySelf: false,
      lockOwnerAgentId: nextLockOwnerAgentId
    };
  }

  if (node.kind !== 'folder') {
    return node;
  }

  const childIndex = path[depth + 1];
  if (childIndex === undefined) {
    return node;
  }
  const child = node.children[childIndex];
  if (!child) {
    return node;
  }

  const nextChild = updateProjectTreeStatusFromStreamNode(child, path, depth + 1, payload);
  if (nextChild === child) {
    return node;
  }
  const nextChildren = [...node.children];
  nextChildren[childIndex] = nextChild;
  return {
    ...node,
    children: nextChildren
  };
};

const updateProjectTreeStatusFromStream = (
  tree: ProjectTreeSnapshot,
  projectPathById: ReadonlyMap<string, readonly number[]>,
  payload: ProjectStreamPayload
): ProjectTreeSnapshot => {
  const path = projectPathById.get(payload.projectId);
  if (!path || path.length === 0) {
    return tree;
  }
  const rootIndex = path[0];
  if (rootIndex === undefined) {
    return tree;
  }
  const rootNode = tree.roots[rootIndex];
  if (!rootNode) {
    return tree;
  }
  const nextRoot = updateProjectTreeStatusFromStreamNode(rootNode, path, 0, payload);
  if (nextRoot === rootNode) {
    return tree;
  }
  const nextRoots = [...tree.roots];
  nextRoots[rootIndex] = nextRoot;
  return {
    ...tree,
    roots: nextRoots
  };
};

export const buildStreamUrl = (projectId: string, lastEventId: number, workspaceId?: string): string => {
  const encoded = encodeURIComponent(projectId);
  const basePath = `/projects/${encoded}/stream`;
  const query = new URLSearchParams();
  if (lastEventId >= 0) {
    query.set('lastEventId', String(lastEventId));
  }
  if (workspaceId && workspaceId.trim().length > 0) {
    query.set('workspaceId', workspaceId.trim());
  }
  const queryString = query.toString();
  return buildGatewayApiUrl(queryString ? `${basePath}?${queryString}` : basePath);
};
