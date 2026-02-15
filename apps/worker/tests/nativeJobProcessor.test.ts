import assert from 'node:assert/strict';

import type { NativeJob, NativePipelineStore } from '@ashfox/native-pipeline';
import type { Logger } from '@ashfox/runtime/logging';
import { processOneNativeJob } from '../src/nativeJobProcessor';

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
      claimNextJob: () => {
        claimed = true;
        return null;
      },
      completeJob: () => null,
      failJob: () => null
    } as unknown as NativePipelineStore;

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
      status: 'running',
      createdAt: new Date().toISOString()
    };
    let completeCalled = false;
    const store = {
      claimNextJob: () => claimedJob,
      completeJob: (jobId: string, result?: Record<string, unknown>) => {
        completeCalled = true;
        assert.equal(jobId, 'job-1');
        assert.equal(result?.kind, 'gltf.convert');
        return { ...claimedJob, status: 'completed', result };
      },
      failJob: () => {
        throw new Error('failJob should not be called in success case');
      }
    } as unknown as NativePipelineStore;

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
      claimNextJob: () => {
        throw error;
      },
      completeJob: () => null,
      failJob: () => {
        failCalled = true;
        return null;
      }
    } as unknown as NativePipelineStore;

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
      createdAt: new Date().toISOString()
    };
    let failCalled = false;
    const store = {
      claimNextJob: () => claimedJob,
      completeJob: () => {
        throw new Error('complete failed');
      },
      failJob: (jobId: string, message: string) => {
        failCalled = true;
        assert.equal(jobId, 'job-2');
        assert.equal(message, 'complete failed');
        return { ...claimedJob, status: 'failed', error: message };
      }
    } as unknown as NativePipelineStore;

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
      createdAt: new Date().toISOString()
    };
    const store = {
      claimNextJob: () => claimedJob,
      completeJob: () => {
        throw new Error('complete failed hard');
      },
      failJob: () => {
        throw new Error('fail mark failed');
      }
    } as unknown as NativePipelineStore;

    await processOneNativeJob({
      workerId: 'worker-3',
      logger,
      enabled: true,
      store
    });
  }
};
