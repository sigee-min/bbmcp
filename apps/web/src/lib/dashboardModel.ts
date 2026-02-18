import { buildGatewayApiUrl } from './gatewayApi';

export type Vec3 = readonly [number, number, number];

export type DashboardStatus = 'loading' | 'empty' | 'success' | 'error';
export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
export type DashboardErrorCode = 'project_load_failed' | 'stream_unavailable';

export type HierarchyKind = 'bone' | 'cube';

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

export interface ProjectSnapshot {
  projectId: string;
  name: string;
  revision: number;
  hasGeometry: boolean;
  focusAnchor?: Vec3;
  hierarchy: readonly HierarchyNode[];
  animations: readonly AnimationSummary[];
  stats: ProjectStats;
}

export interface ProjectStreamPayload {
  projectId: string;
  revision: number;
  hasGeometry: boolean;
  focusAnchor?: Vec3;
  hierarchy: readonly HierarchyNode[];
  animations: readonly AnimationSummary[];
  stats: ProjectStats;
}

export interface ViewerState {
  focusAnchor: Vec3;
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
  selectedProjectId: string | null;
  activeTab: InspectorTabId;
  viewer: ViewerState;
  lastAppliedRevision: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ViewerAnchorMeasurementInput {
  viewportWidth: number;
  viewportHeight: number;
  renderedAnchor: ScreenPoint;
  expectedAnchor: Vec3;
  actualAnchor: Vec3;
}

export interface ViewerAnchorMeasurement {
  screenErrorPx: number;
  worldError: number;
}

export interface ViewerAnchorTolerance {
  screenPx: number;
  world: number;
}

const ZERO_ANCHOR: Vec3 = [0, 0, 0];
const DEFAULT_ANCHOR: Vec3 = [0, 24, 0];
const DEFAULT_VIEWER_TOLERANCE: ViewerAnchorTolerance = {
  screenPx: 1,
  world: 1e-3
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

const calculateVecDistance = (left: Vec3, right: Vec3): number =>
  Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

const calculatePointDistance = (left: ScreenPoint, right: ScreenPoint): number =>
  Math.hypot(left.x - right.x, left.y - right.y);

const asVec3 = (value: readonly number[] | undefined, fallback: Vec3): Vec3 => {
  if (!value || value.length !== 3) {
    return [fallback[0], fallback[1], fallback[2]];
  }
  return [value[0] ?? fallback[0], value[1] ?? fallback[1], value[2] ?? fallback[2]];
};

export const normalizeFocusAnchor = (project: Pick<ProjectSnapshot, 'hasGeometry' | 'focusAnchor'>): Vec3 => {
  if (!project.hasGeometry) {
    return [ZERO_ANCHOR[0], ZERO_ANCHOR[1], ZERO_ANCHOR[2]];
  }
  return asVec3(project.focusAnchor, DEFAULT_ANCHOR);
};

const buildViewerState = (project: Pick<ProjectSnapshot, 'hasGeometry' | 'focusAnchor'> | null): ViewerState => {
  if (!project) {
    return {
      focusAnchor: [ZERO_ANCHOR[0], ZERO_ANCHOR[1], ZERO_ANCHOR[2]],
      yawDeg: 0,
      pitchDeg: 0
    };
  }
  return {
    focusAnchor: normalizeFocusAnchor(project),
    yawDeg: 0,
    pitchDeg: 0
  };
};

const getProjectById = (projects: readonly ProjectSnapshot[], projectId: string | null): ProjectSnapshot | null => {
  if (!projectId) {
    return null;
  }
  for (const project of projects) {
    if (project.projectId === projectId) {
      return project;
    }
  }
  return null;
};

export const createInitialDashboardState = (): DashboardState => ({
  status: 'loading',
  streamStatus: 'idle',
  errorCode: null,
  projects: [],
  selectedProjectId: null,
  activeTab: 'hierarchy',
  viewer: buildViewerState(null),
  lastAppliedRevision: -1
});

export const createErrorState = (code: DashboardErrorCode): DashboardState => ({
  status: 'error',
  streamStatus: 'idle',
  errorCode: code,
  projects: [],
  selectedProjectId: null,
  activeTab: 'hierarchy',
  viewer: buildViewerState(null),
  lastAppliedRevision: -1
});

export const applyDashboardError = (state: DashboardState, code: DashboardErrorCode): DashboardState => {
  if (state.projects.length === 0) {
    return createErrorState(code);
  }

  const selectedProject = getProjectById(state.projects, state.selectedProjectId) ?? state.projects[0] ?? null;
  const selectedProjectId = selectedProject?.projectId ?? null;
  const shouldResetViewer = selectedProjectId !== state.selectedProjectId;

  return {
    ...state,
    status: 'success',
    errorCode: code,
    selectedProjectId,
    viewer: shouldResetViewer ? buildViewerState(selectedProject) : state.viewer,
    lastAppliedRevision: selectedProject?.revision ?? state.lastAppliedRevision
  };
};

export const createLoadedState = (projects: readonly ProjectSnapshot[]): DashboardState => {
  if (projects.length === 0) {
    return {
      status: 'empty',
      streamStatus: 'idle',
      errorCode: null,
      projects: [],
      selectedProjectId: null,
      activeTab: 'hierarchy',
      viewer: buildViewerState(null),
      lastAppliedRevision: -1
    };
  }

  const selectedProject = projects[0];
  return {
    status: 'success',
    streamStatus: 'idle',
    errorCode: null,
    projects,
    selectedProjectId: selectedProject.projectId,
    activeTab: 'hierarchy',
    viewer: buildViewerState(selectedProject),
    lastAppliedRevision: selectedProject.revision
  };
};

export const selectProject = (state: DashboardState, projectId: string): DashboardState => {
  const selectedProject = getProjectById(state.projects, projectId);
  if (!selectedProject) {
    return state;
  }
  return {
    ...state,
    selectedProjectId: projectId,
    viewer: buildViewerState(selectedProject),
    lastAppliedRevision: selectedProject.revision,
    streamStatus: 'connecting',
    errorCode: null
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
  focusAnchor: viewer.focusAnchor,
  yawDeg: viewer.yawDeg + deltaX * 0.35,
  pitchDeg: clamp(viewer.pitchDeg - deltaY * 0.35, -75, 75)
});

export const getViewportCenter = (viewportWidth: number, viewportHeight: number): ScreenPoint => ({
  x: viewportWidth / 2,
  y: viewportHeight / 2
});

export const measureViewerAnchorAlignment = (input: ViewerAnchorMeasurementInput): ViewerAnchorMeasurement => ({
  screenErrorPx: calculatePointDistance(getViewportCenter(input.viewportWidth, input.viewportHeight), input.renderedAnchor),
  worldError: calculateVecDistance(input.expectedAnchor, input.actualAnchor)
});

export const isViewerAnchorWithinTolerance = (
  measurement: ViewerAnchorMeasurement,
  tolerance: ViewerAnchorTolerance = DEFAULT_VIEWER_TOLERANCE
): boolean => measurement.screenErrorPx <= tolerance.screenPx && measurement.worldError <= tolerance.world;

export const shouldApplyStreamPayload = (
  selectedProjectId: string | null,
  lastAppliedRevision: number,
  payload: ProjectStreamPayload
): boolean => {
  if (selectedProjectId === null) {
    return false;
  }
  if (payload.projectId !== selectedProjectId) {
    return false;
  }
  return payload.revision > lastAppliedRevision;
};

const upsertProject = (
  projects: readonly ProjectSnapshot[],
  payload: ProjectStreamPayload
): readonly ProjectSnapshot[] => {
  let found = false;
  const next = projects.map((project) => {
    if (project.projectId !== payload.projectId) {
      return project;
    }
    found = true;
    return {
      ...project,
      revision: payload.revision,
      hasGeometry: payload.hasGeometry,
      focusAnchor: payload.focusAnchor,
      hierarchy: payload.hierarchy,
      animations: payload.animations,
      stats: payload.stats
    };
  });
  if (found) {
    return next;
  }
  return [
    ...next,
    {
      projectId: payload.projectId,
      name: payload.projectId,
      revision: payload.revision,
      hasGeometry: payload.hasGeometry,
      focusAnchor: payload.focusAnchor,
      hierarchy: payload.hierarchy,
      animations: payload.animations,
      stats: payload.stats
    }
  ];
};

export const applyProjectStreamPayload = (state: DashboardState, payload: ProjectStreamPayload): DashboardState => {
  if (!shouldApplyStreamPayload(state.selectedProjectId, state.lastAppliedRevision, payload)) {
    return state;
  }

  const projects = upsertProject(state.projects, payload);
  const shouldResetAnchor = state.selectedProjectId === payload.projectId && payload.hasGeometry === false;
  return {
    ...state,
    projects,
    streamStatus: 'open',
    errorCode: null,
    lastAppliedRevision: payload.revision,
    viewer: shouldResetAnchor
      ? {
          ...state.viewer,
          focusAnchor: [ZERO_ANCHOR[0], ZERO_ANCHOR[1], ZERO_ANCHOR[2]]
        }
      : state.viewer
  };
};

export const buildStreamUrl = (projectId: string, lastEventId: number): string => {
  const encoded = encodeURIComponent(projectId);
  const basePath = `/projects/${encoded}/stream`;
  if (lastEventId < 0) {
    return buildGatewayApiUrl(basePath);
  }
  return buildGatewayApiUrl(`${basePath}?lastEventId=${lastEventId}`);
};

export const isProjectStreamPayload = (value: unknown): value is ProjectStreamPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ProjectStreamPayload>;
  if (typeof candidate.projectId !== 'string') {
    return false;
  }
  if (typeof candidate.revision !== 'number' || Number.isNaN(candidate.revision)) {
    return false;
  }
  if (typeof candidate.hasGeometry !== 'boolean') {
    return false;
  }
  if (!Array.isArray(candidate.hierarchy) || !Array.isArray(candidate.animations)) {
    return false;
  }
  if (!candidate.stats || typeof candidate.stats !== 'object') {
    return false;
  }
  const stats = candidate.stats as Partial<ProjectStats>;
  return typeof stats.bones === 'number' && typeof stats.cubes === 'number';
};
