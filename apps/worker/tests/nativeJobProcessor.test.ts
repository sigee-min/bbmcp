import assert from 'node:assert/strict';

import type { BackendPort } from '@ashfox/backend-core';
import type { NativeJob, NativeJobResult } from '@ashfox/native-pipeline';
import type { ToolName, ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
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

const createBackend = (
  handler: <TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName]
  ) => Promise<ToolResponse<ToolResultMap[TName]>> | ToolResponse<ToolResultMap[TName]>
): BackendPort => ({
  kind: 'engine',
  getHealth: async () => ({
    kind: 'engine',
    availability: 'ready',
    version: 'test',
    details: {
      persistence: {
        database: { provider: 'memory', ready: true },
        storage: { provider: 'memory', ready: true }
      }
    }
  }),
  handleTool: async (name, payload) => handler(name, payload)
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
      payload: { codecId: 'gltf', optimize: true },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };

    const backendCalls: string[] = [];
    const backend = createBackend(async (name, payload) => {
      backendCalls.push(name);
      if (name === 'ensure_project') {
        return {
          ok: true,
          data: {
            action: 'reused',
            project: {
              id: 'project-a',
              name: 'project-a'
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'export') {
        assert.equal(payload.format, 'gltf');
        return {
          ok: true,
          data: {
            path: `native-jobs/project-a/${claimedJob.id}.gltf`,
            selectedTarget: { kind: 'gltf', id: 'gltf' },
            warnings: ['best_effort']
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      return {
        ok: false,
        error: {
          code: 'invalid_state',
          message: `unexpected tool: ${name}`
        }
      } as ToolResponse<ToolResultMap[typeof name]>;
    });

    let completeCalled = false;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async (jobId: string, result?: NativeJobResult) => {
        completeCalled = true;
        assert.equal(jobId, 'job-1');
        assert.equal(result?.kind, 'gltf.convert');
        assert.equal(result?.status, 'converted');
        assert.equal(result?.attemptCount, 1);
        assert.equal(result?.processedBy, 'worker-1');
        assert.equal(result?.output?.selectedTarget, 'gltf');
        assert.equal(result?.output?.requestedCodecId, 'gltf');
        assert.equal(result?.output?.selectedFormat, 'gltf');
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
      backend,
      store
    });

    assert.equal(completeCalled, true);
    assert.deepEqual(backendCalls, ['ensure_project', 'export']);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-native-codec',
      projectId: 'project-native',
      kind: 'gltf.convert',
      payload: { codecId: 'unknown-codec', optimize: false },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };

    const backend = createBackend(async (name, payload) => {
      if (name === 'ensure_project') {
        return {
          ok: true,
          data: {
            action: 'reused',
            project: {
              id: 'project-native',
              name: 'project-native'
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'export') {
        assert.equal(payload.format, 'native_codec');
        assert.equal(payload.codecId, 'unknown-codec');
        return {
          ok: true,
          data: {
            path: `native-jobs/project-native/${claimedJob.id}.gltf`,
            selectedTarget: { kind: 'native_codec', id: 'unknown-codec', codecId: 'unknown-codec' },
            warnings: []
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      return {
        ok: false,
        error: {
          code: 'invalid_state',
          message: `unexpected tool: ${name}`
        }
      } as ToolResponse<ToolResultMap[typeof name]>;
    });

    let resultSnapshot: NativeJobResult | undefined;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async (_jobId: string, result?: NativeJobResult) => {
        resultSnapshot = result;
        return { ...claimedJob, status: 'completed', result };
      },
      failJob: async () => {
        throw new Error('native codec route should complete');
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-native-codec',
      logger,
      enabled: true,
      backend,
      store
    });

    assert.equal(resultSnapshot?.kind, 'gltf.convert');
    assert.equal(resultSnapshot?.status, 'converted');
    assert.equal(resultSnapshot?.output?.selectedTarget, 'unknown-codec');
    assert.equal(resultSnapshot?.output?.requestedCodecId, 'unknown-codec');
    assert.equal(resultSnapshot?.output?.selectedFormat, 'native_codec');
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-no-backend',
      projectId: 'project-b',
      kind: 'gltf.convert',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };
    let failedMessage = '';
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async () => {
        throw new Error('completeJob should not run without backend');
      },
      failJob: async (_jobId: string, message: string) => {
        failedMessage = message;
        return { ...claimedJob, status: 'failed', error: message };
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-1',
      logger,
      enabled: true,
      store
    });

    assert.equal(failedMessage, 'Engine backend is required for native job execution.');
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-preflight',
      projectId: 'project-c',
      kind: 'texture.preflight',
      payload: {
        textureIds: ['atlas', 'ghost'],
        maxDimension: 16,
        allowNonPowerOfTwo: false
      },
      status: 'running',
      attemptCount: 2,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };

    const backend = createBackend(async (name) => {
      if (name === 'ensure_project') {
        return {
          ok: true,
          data: {
            action: 'reused',
            project: {
              id: 'project-c',
              name: 'project-c'
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'preflight_texture') {
        return {
          ok: true,
          data: {
            uvUsageId: 'usage-preflight',
            usageSummary: {
              textureCount: 1,
              cubeCount: 1,
              faceCount: 4,
              unresolvedCount: 1
            },
            textureResolution: {
              width: 64,
              height: 64
            },
            textureUsage: {
              textures: [
                {
                  id: 'atlas-id',
                  name: 'atlas',
                  width: 30,
                  height: 16,
                  cubeCount: 1,
                  faceCount: 4,
                  cubes: []
                }
              ],
              unresolved: [
                {
                  textureRef: 'missing',
                  cubeName: 'body',
                  face: 'north'
                }
              ]
            },
            warnings: ['uv_overlap']
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      return {
        ok: false,
        error: {
          code: 'invalid_state',
          message: `unexpected tool: ${name}`
        }
      } as ToolResponse<ToolResultMap[typeof name]>;
    });

    let resultSnapshot: NativeJobResult | undefined;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async (_jobId: string, result?: NativeJobResult) => {
        resultSnapshot = result;
        return { ...claimedJob, status: 'completed', result };
      },
      failJob: async () => {
        throw new Error('preflight should complete');
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-2',
      logger,
      enabled: true,
      backend,
      store
    });

    assert.equal(resultSnapshot?.kind, 'texture.preflight');
    assert.equal(resultSnapshot?.status, 'failed');
    assert.equal(resultSnapshot?.summary?.checked, 1);
    assert.equal(resultSnapshot?.summary?.oversized, 1);
    assert.equal(resultSnapshot?.summary?.nonPowerOfTwo, 1);
    assert.equal(resultSnapshot?.output?.unresolvedCount, 1);
    assert.equal(Array.isArray(resultSnapshot?.diagnostics), true);
    if (Array.isArray(resultSnapshot?.diagnostics)) {
      assert.equal(resultSnapshot.diagnostics.some((entry) => entry.includes('missing texture id(s): ghost')), true);
    }
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
      store,
      processor: async () => ({ kind: 'texture.preflight', status: 'passed' })
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
      store,
      processor: async () => ({ kind: 'gltf.convert', status: 'converted' })
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
      completeJob: async (_jobId: string, result?: NativeJobResult) => {
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
        return { kind: 'gltf.convert', status: 'converted', output: { ok: true, mode: 'custom' } };
      }
    });

    assert.equal(processorCalled, true);
    assert.equal(outputChecked, true);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-5',
      projectId: 'project-z',
      kind: 'custom.unsupported',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 2,
      leaseMs: 10000,
      createdAt: new Date().toISOString()
    };
    let failed = false;
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async () => null,
      failJob: async (jobId: string, message: string) => {
        failed = true;
        assert.equal(jobId, 'job-5');
        assert.equal(message, 'Unsupported native job kind: custom.unsupported');
        return { ...claimedJob, status: 'failed', error: message };
      }
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-5',
      logger,
      enabled: true,
      store
    });
    assert.equal(failed, true);
  }
};
