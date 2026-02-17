import type { ToolName } from '@ashfox/contracts/types/internal';

const READ_ONLY_TOOLS = new Set<ToolName>([
  'list_capabilities',
  'get_project_state',
  'preflight_texture',
  'read_texture',
  'render_preview',
  'validate',
  'export_trace_log'
]);

export const isMutatingTool = (name: ToolName): boolean => !READ_ONLY_TOOLS.has(name);

type LockJob<T> = () => Promise<T>;

class ProjectLockQueue {
  private queue: Promise<void> = Promise.resolve();

  run<T>(job: LockJob<T>): Promise<T> {
    const runNext = this.queue.then(job, job);
    this.queue = runNext.then(
      () => undefined,
      () => undefined
    );
    return runNext;
  }
}

export class ProjectLockManager {
  private readonly queues = new Map<string, ProjectLockQueue>();

  run<T>(projectKey: string, job: LockJob<T>): Promise<T> {
    const key = projectKey.trim();
    if (!key) {
      return job();
    }
    let queue = this.queues.get(key);
    if (!queue) {
      queue = new ProjectLockQueue();
      this.queues.set(key, queue);
    }
    return queue.run(job);
  }
}
