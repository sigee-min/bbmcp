import { cloneEvent, cloneProject } from './clone';
import { allocateEventSeq, type NativePipelineState } from './state';
import type { NativeProjectEvent, NativeProjectSnapshot } from './types';

const MAX_PROJECT_EVENTS = 200;

export const appendProjectSnapshotEvent = (state: NativePipelineState, project: NativeProjectSnapshot): void => {
  const event: NativeProjectEvent = {
    seq: allocateEventSeq(state),
    event: 'project_snapshot',
    data: cloneProject(project)
  };

  const events = state.projectEvents.get(project.projectId) ?? [];
  events.push(event);
  if (events.length > MAX_PROJECT_EVENTS) {
    events.splice(0, events.length - MAX_PROJECT_EVENTS);
  }
  state.projectEvents.set(project.projectId, events);
};

export const getProjectEventsSince = (
  state: NativePipelineState,
  projectId: string,
  lastSeq: number
): NativeProjectEvent[] => {
  const events = state.projectEvents.get(projectId) ?? [];
  return events.filter((event) => event.seq > lastSeq).map((event) => cloneEvent(event));
};
