import assert from 'node:assert/strict';

import type { NativeJob } from '@ashfox/native-pipeline';
import type { Logger } from '@ashfox/runtime/logging';
import { processOneNativeJob } from '../src/nativeJobProcessor';

type NativePipelineStorePort = NonNullable<Parameters<typeof processOneNativeJob>[0]['store']>;

type MutableJob = NativeJob & {
  result?: Record<string, unknown>;
  error?: string;
};

const createLogger = (): Logger => ({
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
});

module.exports = async () => {
  const logger = createLogger();

  {
    let claimed = false;
    const store = {
      claimNextJob: async () => {
        claimed = true;
        return null;
      },
      completeJob: async () => null,
      failJob: async () => null
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-1',
      logger,
      enabled: false,
      store
    });
    assert.equal(claimed, false);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-1',
      projectId: 'project-a',
      kind: 'gltf.convert',
      payload: { codecId: 'gltf' },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };
    let completeCalled = false;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async (jobId: string, result?: Record<string, unknown>) => {
        completeCalled = true;
        assert.equal(jobId, 'job-1');
        assert.equal(result?.kind, 'gltf.convert');
        assert.equal(result?.attemptCount, 1);
        assert.deepEqual(result?.output, {
          kind: 'gltf.convert',
          payload: { codecId: 'gltf' }
        });
        return { ...claimedJob, status: 'completed', result };
      },
      failJob: async () => {
        throw new Error('failJob should not be called in success case');
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-1',
      logger,
      enabled: true,
      store
    });
    assert.equal(completeCalled, true);
  }

  {
    const error = new Error('claim error');
    let failCalled = false;
    const store = {
      claimNextJob: async () => {
        throw error;
      },
      completeJob: async () => null,
      failJob: async () => {
        failCalled = true;
        return null;
      }
    } satisfies NativePipelineStorePort;

    await assert.rejects(
      () =>
        processOneNativeJob({
          workerId: 'worker-1',
          logger,
          enabled: true,
          store
        }),
      /claim error/
    );
    assert.equal(failCalled, false);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-2',
      projectId: 'project-b',
      kind: 'texture.preflight',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };
    let failCalled = false;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async () => {
        throw new Error('complete failed');
      },
      failJob: async (jobId: string, message: string) => {
        failCalled = true;
        assert.equal(jobId, 'job-2');
        assert.equal(message, 'complete failed');
        return { ...claimedJob, status: 'failed', error: message };
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-2',
      logger,
      enabled: true,
      store
    });
    assert.equal(failCalled, true);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-3',
      projectId: 'project-c',
      kind: 'gltf.convert',
      status: 'running',
      attemptCount: 2,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async () => {
        throw new Error('complete failed hard');
      },
      failJob: async () => {
        throw new Error('fail mark failed');
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-3',
      logger,
      enabled: true,
      store
    });
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-4',
      projectId: 'project-z',
      kind: 'custom.convert',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 2,
      leaseMs: 10000,
      createdAt: new Date().toISOString()
    };
    let processorCalled = false;
    let outputChecked = false;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async (_jobId: string, result?: Record<string, unknown>) => {
        outputChecked = true;
        assert.deepEqual(result?.output, { ok: true, mode: 'custom' });
        return { ...claimedJob, status: 'completed', result };
      },
      failJob: async () => null
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-4',
      logger,
      enabled: true,
      store,
      processor: async (job) => {
        processorCalled = true;
        assert.equal(job.id, 'job-4');
        return { ok: true, mode: 'custom' };
      }
    });

    assert.equal(processorCalled, true);
    assert.equal(outputChecked, true);
  }
};
