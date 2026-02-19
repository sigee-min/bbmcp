import type {
  NativeJob,
  NativeProjectEvent,
  NativeProjectFolder,
  NativeProjectLock,
  NativeProjectSnapshot,
  NativeTreeChildRef
} from './types';

const DEFAULT_WORKSPACE_ID = 'ws_default';

export interface NativePipelineState {
  readonly workspaceId: string;
  readonly projects: Map<string, NativeProjectSnapshot>;
  readonly folders: Map<string, NativeProjectFolder>;
  readonly rootChildren: NativeTreeChildRef[];
  readonly jobs: Map<string, NativeJob>;
  readonly queuedJobIds: string[];
  readonly projectLocks: Map<string, NativeProjectLock>;
  readonly projectEvents: Map<string, NativeProjectEvent[]>;
  nextJobId: number;
  nextEntityNonce: number;
  nextSeq: number;
}

export const createNativePipelineState = (workspaceId: string = DEFAULT_WORKSPACE_ID): NativePipelineState => ({
  workspaceId,
  projects: new Map<string, NativeProjectSnapshot>(),
  folders: new Map<string, NativeProjectFolder>(),
  rootChildren: [],
  jobs: new Map<string, NativeJob>(),
  queuedJobIds: [],
  projectLocks: new Map<string, NativeProjectLock>(),
  projectEvents: new Map<string, NativeProjectEvent[]>(),
  nextJobId: 1,
  nextEntityNonce: 1,
  nextSeq: 1
});

export const resetNativePipelineState = (state: NativePipelineState): void => {
  state.projects.clear();
  state.folders.clear();
  state.rootChildren.splice(0, state.rootChildren.length);
  state.jobs.clear();
  state.queuedJobIds.splice(0, state.queuedJobIds.length);
  state.projectLocks.clear();
  state.projectEvents.clear();
  state.nextJobId = 1;
  state.nextEntityNonce = 1;
  state.nextSeq = 1;
};

export const allocateNativeJobId = (state: NativePipelineState): string => {
  const id = `job-${String(state.nextJobId).padStart(6, '0')}`;
  state.nextJobId += 1;
  return id;
};

export const allocateEventSeq = (state: NativePipelineState): number => {
  const seq = state.nextSeq;
  state.nextSeq += 1;
  return seq;
};
