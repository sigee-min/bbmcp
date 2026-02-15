import type { NativeJob, NativeProjectEvent, NativeProjectSnapshot } from './types';

export interface NativePipelineState {
  readonly projects: Map<string, NativeProjectSnapshot>;
  readonly jobs: Map<string, NativeJob>;
  readonly queuedJobIds: string[];
  readonly projectEvents: Map<string, NativeProjectEvent[]>;
  nextJobId: number;
  nextSeq: number;
}

export const createNativePipelineState = (): NativePipelineState => ({
  projects: new Map<string, NativeProjectSnapshot>(),
  jobs: new Map<string, NativeJob>(),
  queuedJobIds: [],
  projectEvents: new Map<string, NativeProjectEvent[]>(),
  nextJobId: 1,
  nextSeq: 1
});

export const resetNativePipelineState = (state: NativePipelineState): void => {
  state.projects.clear();
  state.jobs.clear();
  state.queuedJobIds.splice(0, state.queuedJobIds.length);
  state.projectEvents.clear();
  state.nextJobId = 1;
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
