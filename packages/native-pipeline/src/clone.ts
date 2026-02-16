import type { NativeJob, NativeProjectEvent, NativeProjectSnapshot } from './types';

export const cloneProject = (project: NativeProjectSnapshot): NativeProjectSnapshot => ({
  projectId: project.projectId,
  name: project.name,
  revision: project.revision,
  hasGeometry: project.hasGeometry,
  ...(project.focusAnchor ? { focusAnchor: [project.focusAnchor[0], project.focusAnchor[1], project.focusAnchor[2]] } : {}),
  hierarchy: project.hierarchy.map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    children: node.children.map((child) => ({
      id: child.id,
      name: child.name,
      kind: child.kind,
      children: []
    }))
  })),
  animations: project.animations.map((animation) => ({
    id: animation.id,
    name: animation.name,
    length: animation.length,
    loop: animation.loop
  })),
  stats: {
    bones: project.stats.bones,
    cubes: project.stats.cubes
  },
  ...(project.activeJob ? { activeJob: { id: project.activeJob.id, status: project.activeJob.status } } : {})
});

export const cloneJob = (job: NativeJob): NativeJob => ({
  id: job.id,
  projectId: job.projectId,
  kind: job.kind,
  ...(job.payload ? { payload: { ...job.payload } } : {}),
  status: job.status,
  attemptCount: job.attemptCount,
  maxAttempts: job.maxAttempts,
  leaseMs: job.leaseMs,
  createdAt: job.createdAt,
  ...(job.startedAt ? { startedAt: job.startedAt } : {}),
  ...(job.leaseExpiresAt ? { leaseExpiresAt: job.leaseExpiresAt } : {}),
  ...(job.nextRetryAt ? { nextRetryAt: job.nextRetryAt } : {}),
  ...(job.completedAt ? { completedAt: job.completedAt } : {}),
  ...(job.workerId ? { workerId: job.workerId } : {}),
  ...(job.result ? { result: { ...job.result } } : {}),
  ...(job.error ? { error: job.error } : {}),
  ...(job.deadLetter ? { deadLetter: true } : {})
});

export const cloneEvent = (event: NativeProjectEvent): NativeProjectEvent => ({
  seq: event.seq,
  event: event.event,
  data: cloneProject(event.data)
});
