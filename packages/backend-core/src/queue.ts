export interface QueueStorePort<TJob, TSubmitInput, TResult = Record<string, unknown>> {
  submitJob(input: TSubmitInput): Promise<TJob>;
  claimNextJob(workerId: string): Promise<TJob | null>;
  completeJob(jobId: string, result?: TResult): Promise<TJob | null>;
  failJob(jobId: string, error: string): Promise<TJob | null>;
  getJob?(jobId: string): Promise<TJob | null>;
  listProjectJobs?(projectId: string): Promise<TJob[]>;
}

export interface ProjectSnapshotStorePort<TProject> {
  listProjects(query?: string): Promise<TProject[]>;
  getProject(projectId: string): Promise<TProject | null>;
}

export interface StreamEventStorePort<TEvent> {
  getProjectEventsSince(projectId: string, lastSeq: number): Promise<TEvent[]>;
}
