import type { Logger } from '@ashfox/runtime/logging';
import { getNativePipelineStore, type NativePipelineStore } from '@ashfox/native-pipeline';

type ProcessNativeJobArgs = {
  workerId: string;
  logger: Logger;
  enabled: boolean;
  store?: NativePipelineStore;
};

const simulateJobWork = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
};

export const processOneNativeJob = async ({ workerId, logger, enabled, store: injectedStore }: ProcessNativeJobArgs): Promise<void> => {
  if (!enabled) return;

  const store = injectedStore ?? getNativePipelineStore();
  const job = store.claimNextJob(workerId);
  if (!job) return;

  logger.info('ashfox worker claimed native job', {
    workerId,
    jobId: job.id,
    projectId: job.projectId,
    kind: job.kind
  });

  try {
    await simulateJobWork();
    const result = {
      processedBy: workerId,
      kind: job.kind,
      finishedAt: new Date().toISOString()
    };
    store.completeJob(job.id, result);
    logger.info('ashfox worker completed native job', {
      workerId,
      jobId: job.id,
      projectId: job.projectId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      store.failJob(job.id, message);
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
