import type { Logger } from '@ashfox/runtime/logging';
import { getNativePipelineStore, type NativeJob, type NativePipelineQueueStorePort } from '@ashfox/native-pipeline';

type NativePipelineWorkerStorePort = Pick<NativePipelineQueueStorePort, 'claimNextJob' | 'completeJob' | 'failJob'>;

type ProcessNativeJobArgs = {
  workerId: string;
  logger: Logger;
  enabled: boolean;
  store?: NativePipelineWorkerStorePort;
  processor?: NativeJobProcessor;
};

type NativeJobProcessor = (job: NativeJob) => Promise<Record<string, unknown> | void>;

const simulateJobWork = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
};

const defaultProcessor: NativeJobProcessor = async (job) => {
  await simulateJobWork();
  return {
    kind: job.kind,
    payload: job.payload ?? null
  };
};

export const processOneNativeJob = async ({
  workerId,
  logger,
  enabled,
  store: injectedStore,
  processor
}: ProcessNativeJobArgs): Promise<void> => {
  if (!enabled) return;

  const store = injectedStore ?? getNativePipelineStore();
  const activeProcessor = processor ?? defaultProcessor;
  const job = await store.claimNextJob(workerId);
  if (!job) return;

  logger.info('ashfox worker claimed native job', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    kind: job.kind
  });

  try {
    const processorResult = await activeProcessor(job);
    const result = {
      processedBy: workerId,
      kind: job.kind,
      attemptCount: job.attemptCount,
      ...(processorResult ? { output: processorResult } : {}),
      finishedAt: new Date().toISOString()
    };
    await store.completeJob(job.id, result);
    logger.info('ashfox worker completed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await store.failJob(job.id, message);
    } catch (failError) {
      const failMessage = failError instanceof Error ? failError.message : String(failError);
      logger.error('ashfox worker failed to mark native job failure', {
        workerId,
        jobId: job.id,
        projectId: job.projectId,
        message: failMessage
      });
    }
    logger.error('ashfox worker failed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId,
      message
    });
  }
};
