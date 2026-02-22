import assert from 'node:assert/strict';

import type { NativeJob, NativeJobResult } from '@ashfox/native-pipeline';
import type { ToolPayloadMap, ToolResponse, ToolResultMap } from '@ashfox/contracts/types/internal';
import { processOneNativeJob } from '../src/nativeJobProcessor';
import { createBackendStub, createNoopLogger } from './helpers/backendStub';

type NativePipelineStorePort = NonNullable<Parameters<typeof processOneNativeJob>[0]['store']>;

type MutableJob = NativeJob & {
  result?: Record<string, unknown>;
  error?: string;
};

module.exports = async () => {
  const logger = createNoopLogger();

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
      id: 'job-workspace-scan',
      projectId: 'project-workspace',
      kind: 'texture.preflight',
      status: 'running',
      attemptCount: 1,
      maxAttempts: 2,
      leaseMs: 10000,
      createdAt: new Date().toISOString()
    };
    const claimWorkspaceIds: Array<string | undefined> = [];
    let completedWorkspaceId = '';
    const store = {
      claimNextJob: async (_workerId: string, workspaceId?: string) => {
        claimWorkspaceIds.push(workspaceId);
        if (workspaceId === 'ws-empty') {
          return null;
        }
        return claimedJob;
      },
      completeJob: async (_jobId: string, _result?: NativeJobResult, workspaceId?: string) => {
        completedWorkspaceId = workspaceId ?? '';
        return { ...claimedJob, status: 'completed' };
      },
      failJob: async () => null
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-workspace',
      logger,
      enabled: true,
      store,
      workspaceIdsResolver: async () => ['ws-empty', 'ws-ready'],
      processor: async () => ({ kind: 'texture.preflight', status: 'passed' })
    });

    assert.deepEqual(claimWorkspaceIds, ['ws-empty', 'ws-ready']);
    assert.equal(completedWorkspaceId, 'ws-ready');
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
    const backend = createBackendStub(async (name, payload) => {
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
      if (name === 'get_project_state') {
        return {
          ok: true,
          data: {
            project: {
              id: 'project-a',
              active: true,
              name: 'project-a',
              revision: 'rev-1',
              counts: {
                bones: 1,
                cubes: 1,
                textures: 0,
                animations: 0
              },
              bones: [{ id: 'bone-root', name: 'root', pivot: [0, 0, 0] }],
              cubes: [
                {
                  id: 'cube-body',
                  name: 'body',
                  bone: 'root',
                  from: [0, 0, 0],
                  to: [1, 1, 1]
                }
              ]
            }
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
        assert.equal(result?.hasGeometry, true);
        assert.equal(result?.animations?.length, 0);
        assert.equal(Array.isArray(result?.hierarchy), true);
        assert.equal(result?.hierarchy?.[0]?.name, 'root');
        assert.equal(result?.hierarchy?.[0]?.children.length, 1);
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
    assert.deepEqual(backendCalls, ['list_capabilities', 'ensure_project', 'export', 'get_project_state']);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-existing-animation',
      projectId: 'project-animated',
      kind: 'gltf.convert',
      payload: { codecId: 'gltf', optimize: true },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };

    const backendCalls: string[] = [];
    const backend = createBackendStub(async (name, payload) => {
      backendCalls.push(name);
      if (name === 'ensure_project') {
        return {
          ok: true,
          data: {
            action: 'reused',
            project: {
              id: 'project-animated',
              name: 'project-animated'
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'get_project_state') {
        return {
          ok: true,
          data: {
            project: {
              id: 'project-animated',
              active: true,
              name: 'project-animated',
              revision: 'rev-animated-1',
              counts: {
                bones: 2,
                cubes: 1,
                textures: 0,
                animations: 1
              },
              bones: [
                { id: 'bone-root', name: 'root', pivot: [0, 0, 0] },
                { id: 'bone-body', name: 'body', parent: 'root', pivot: [0, 8, 0] }
              ],
              cubes: [
                {
                  id: 'cube-body',
                  name: 'body',
                  bone: 'body',
                  from: [-1, -1, -1],
                  to: [1, 1, 1]
                }
              ],
              animations: [
                {
                  id: 'clip-walk',
                  name: 'Walk',
                  length: 1.25,
                  loop: true
                }
              ]
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'export') {
        assert.equal(payload.format, 'gltf');
        return {
          ok: true,
          data: {
            path: `native-jobs/project-animated/${claimedJob.id}.gltf`,
            selectedTarget: { kind: 'gltf', id: 'gltf' },
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
        throw new Error('animation path should complete');
      },
      getProject: async () => ({
        projectId: 'project-animated',
        workspaceId: 'ws-test',
        name: 'project-animated',
        parentFolderId: null,
        revision: 5,
        hasGeometry: true,
        hierarchy: [{ id: 'bone-root', name: 'root', kind: 'bone', children: [] }],
        animations: [{ id: 'clip-walk', name: 'Walk', length: 1.25, loop: true }],
        stats: { bones: 2, cubes: 1 },
        textureSources: [],
        textures: []
      })
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-animated',
      logger,
      enabled: true,
      backend,
      store
    });

    assert.equal(resultSnapshot?.kind, 'gltf.convert');
    assert.equal(resultSnapshot?.status, 'converted');
    assert.equal(resultSnapshot?.animations?.length, 1);
    assert.equal(resultSnapshot?.animations?.[0]?.id, 'clip-walk');
    assert.equal(resultSnapshot?.animations?.[0]?.name, 'Walk');
    assert.equal(resultSnapshot?.animations?.[0]?.loop, true);
    assert.deepEqual(backendCalls, ['list_capabilities', 'ensure_project', 'get_project_state', 'export', 'get_project_state']);
  }

  {
    const claimedJob: MutableJob = {
      id: 'job-seeded-assets',
      projectId: 'project-seeded-assets',
      kind: 'gltf.convert',
      payload: { codecId: 'gltf', optimize: true },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };

    const runtimeState = {
      revision: 1,
      bones: [] as Array<{ id: string; name: string; parent?: string; pivot: [number, number, number] }>,
      cubes: [] as Array<{ id: string; name: string; bone: string; from: [number, number, number]; to: [number, number, number] }>,
      animations: [] as Array<{ id: string; name: string; length: number; loop: boolean }>,
      textures: [] as Array<{ id: string; name: string; width: number; height: number }>
    };

    const applyRevision = (): string => {
      runtimeState.revision += 1;
      return `rev-seeded-${runtimeState.revision}`;
    };

    const buildState = () => ({
      id: 'project-seeded-assets',
      active: true,
      name: 'project-seeded-assets',
      revision: `rev-seeded-${runtimeState.revision}`,
      counts: {
        bones: runtimeState.bones.length,
        cubes: runtimeState.cubes.length,
        textures: runtimeState.textures.length,
        animations: runtimeState.animations.length
      },
      bones: runtimeState.bones.map((bone) => ({
        id: bone.id,
        name: bone.name,
        ...(bone.parent ? { parent: bone.parent } : {}),
        pivot: bone.pivot
      })),
      cubes: runtimeState.cubes.map((cube) => ({
        id: cube.id,
        name: cube.name,
        bone: cube.bone,
        from: cube.from,
        to: cube.to
      })),
      animations: runtimeState.animations.map((animation) => ({
        id: animation.id,
        name: animation.name,
        length: animation.length,
        loop: animation.loop
      })),
      textures: runtimeState.textures.map((texture) => ({
        id: texture.id,
        name: texture.name,
        width: texture.width,
        height: texture.height
      }))
    });

    const backendCalls: string[] = [];
    const backend = createBackendStub(async (name, payload) => {
      backendCalls.push(name);
      if (name === 'ensure_project') {
        return {
          ok: true,
          data: {
            action: 'reused',
            project: {
              id: 'project-seeded-assets',
              name: 'project-seeded-assets'
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'get_project_state') {
        return {
          ok: true,
          data: {
            project: buildState()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'add_bone') {
        const addPayload = payload as ToolPayloadMap['add_bone'];
        if (!runtimeState.bones.some((bone) => bone.name === addPayload.name)) {
          runtimeState.bones.push({
            id: `bone-${addPayload.name}`,
            name: addPayload.name,
            ...(addPayload.parent ? { parent: addPayload.parent } : {}),
            pivot: addPayload.pivot ?? [0, 0, 0]
          });
        }
        return {
          ok: true,
          data: {
            id: `bone-${addPayload.name}`,
            name: addPayload.name,
            revision: applyRevision()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'add_cube') {
        const addPayload = payload as ToolPayloadMap['add_cube'];
        if (!runtimeState.cubes.some((cube) => cube.name === addPayload.name)) {
          runtimeState.cubes.push({
            id: `cube-${addPayload.name}`,
            name: addPayload.name,
            bone: addPayload.bone ?? 'root',
            from: addPayload.from,
            to: addPayload.to
          });
        }
        return {
          ok: true,
          data: {
            id: `cube-${addPayload.name}`,
            name: addPayload.name,
            revision: applyRevision()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'create_animation_clip') {
        const clipPayload = payload as ToolPayloadMap['create_animation_clip'];
        const clipId =
          typeof clipPayload.id === 'string' && clipPayload.id.trim().length > 0
            ? clipPayload.id
            : `clip-${clipPayload.name.toLowerCase().replace(/\s+/g, '-')}`;
        if (!runtimeState.animations.some((animation) => animation.name === clipPayload.name)) {
          runtimeState.animations.push({
            id: clipId,
            name: clipPayload.name,
            length: clipPayload.length,
            loop: clipPayload.loop
          });
        }
        return {
          ok: true,
          data: {
            id: clipId,
            name: clipPayload.name,
            revision: applyRevision()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'set_frame_pose') {
        const posePayload = payload as ToolPayloadMap['set_frame_pose'];
        return {
          ok: true,
          data: {
            clip: posePayload.clip,
            clipId: posePayload.clipId,
            frame: posePayload.frame,
            time: 0,
            bones: posePayload.bones.length,
            channels: posePayload.bones.length,
            revision: applyRevision()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'paint_faces') {
        const paintPayload = payload as ToolPayloadMap['paint_faces'];
        const textureName = paintPayload.textureName ?? 'texture';
        const textureId =
          typeof paintPayload.textureId === 'string' && paintPayload.textureId.trim().length > 0
            ? paintPayload.textureId
            : `tex-${textureName.toLowerCase().replace(/\s+/g, '-')}`;
        if (!runtimeState.textures.some((texture) => texture.name === textureName)) {
          runtimeState.textures.push({
            id: textureId,
            name: textureName,
            width: typeof paintPayload.width === 'number' ? paintPayload.width : 16,
            height: typeof paintPayload.height === 'number' ? paintPayload.height : 16
          });
        }
        return {
          ok: true,
          data: {
            textureName,
            width: typeof paintPayload.width === 'number' ? paintPayload.width : 16,
            height: typeof paintPayload.height === 'number' ? paintPayload.height : 16,
            targets: 1,
            facesApplied: 1,
            opsApplied: 1,
            revision: applyRevision()
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'preflight_texture') {
        const anchorCube = runtimeState.cubes[0];
        return {
          ok: true,
          data: {
            uvUsageId: 'usage-seeded-assets',
            usageSummary: {
              textureCount: runtimeState.textures.length,
              cubeCount: runtimeState.cubes.length,
              faceCount: runtimeState.textures.length > 0 && anchorCube ? 1 : 0,
              unresolvedCount: 0
            },
            textureResolution: {
              width: runtimeState.textures[0]?.width ?? 16,
              height: runtimeState.textures[0]?.height ?? 16
            },
            textureUsage: {
              textures: runtimeState.textures.map((texture) => ({
                id: texture.id,
                name: texture.name,
                width: texture.width,
                height: texture.height,
                cubeCount: anchorCube ? 1 : 0,
                faceCount: anchorCube ? 1 : 0,
                cubes: anchorCube
                  ? [
                      {
                        id: anchorCube.id,
                        name: anchorCube.name,
                        faces: [{ face: 'north', uv: [0, 0, 4, 4] }]
                      }
                    ]
                  : []
              })),
              unresolved: []
            },
            warnings: [],
            warningCodes: []
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'read_texture') {
        const readPayload = payload as ToolPayloadMap['read_texture'];
        const texture =
          runtimeState.textures.find((entry) => entry.id === readPayload.id) ??
          runtimeState.textures.find((entry) => entry.name === readPayload.name) ??
          runtimeState.textures[0];
        return {
          ok: true,
          data: {
            texture: {
              id: texture?.id,
              name: texture?.name ?? readPayload.name ?? 'texture',
              mimeType: 'image/png',
              dataUri: 'data:image/png;base64,AAAA',
              width: texture?.width,
              height: texture?.height
            }
          }
        } as ToolResponse<ToolResultMap[typeof name]>;
      }
      if (name === 'export') {
        return {
          ok: true,
          data: {
            path: `native-jobs/project-seeded-assets/${claimedJob.id}.gltf`,
            selectedTarget: { kind: 'gltf', id: 'gltf' },
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
        throw new Error('seeded materialization path should complete');
      },
      getProject: async () => ({
        projectId: 'project-seeded-assets',
        workspaceId: 'ws-test',
        name: 'Forest Fox',
        parentFolderId: null,
        revision: 2,
        hasGeometry: true,
        hierarchy: [{ id: 'bone-root', name: 'root', kind: 'bone', children: [] }],
        animations: [{ id: 'clip-idle', name: 'Idle', length: 1.25, loop: true }],
        stats: { bones: 2, cubes: 1 },
        textureSources: [
          {
            faceId: 'face-root',
            cubeId: 'cube-body',
            cubeName: 'body',
            direction: 'north',
            colorHex: '#ffffff',
            rotationQuarter: 0
          }
        ],
        textures: [
          {
            textureId: 'tex-atlas',
            name: 'atlas',
            width: 16,
            height: 16,
            faceCount: 1,
            imageDataUrl: 'data:image/png;base64,AAAA',
            faces: [],
            uvEdges: []
          }
        ]
      })
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-seeded',
      logger,
      enabled: true,
      backend,
      store
    });

    assert.equal(resultSnapshot?.kind, 'gltf.convert');
    assert.equal(resultSnapshot?.status, 'converted');
    assert.equal((resultSnapshot?.animations?.length ?? 0) > 0, true);
    assert.equal((resultSnapshot?.textures?.length ?? 0) > 0, true);
    assert.equal((resultSnapshot?.textureSources?.length ?? 0) > 0, true);
    assert.equal(backendCalls.includes('create_animation_clip'), true);
    assert.equal(backendCalls.includes('paint_faces'), true);
    assert.equal(backendCalls.includes('read_texture'), true);
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

    const backend = createBackendStub(async (name, payload) => {
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
      if (name === 'get_project_state') {
        return {
          ok: true,
          data: {
            project: {
              id: 'project-native',
              active: true,
              name: 'project-native',
              revision: 'rev-native-1',
              counts: {
                bones: 1,
                cubes: 2,
                textures: 0,
                animations: 0
              },
              bones: [{ id: 'bone-root', name: 'root', pivot: [0, 0, 0] }],
              cubes: [
                {
                  id: 'cube-a',
                  name: 'cube-a',
                  bone: 'root',
                  from: [0, 0, 0],
                  to: [1, 1, 1]
                },
                {
                  id: 'cube-b',
                  name: 'cube-b',
                  bone: 'root',
                  from: [1, 0, 0],
                  to: [2, 1, 1]
                }
              ]
            }
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
    assert.equal(resultSnapshot?.hasGeometry, true);
    assert.equal(resultSnapshot?.hierarchy?.[0]?.children.length, 2);
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
      id: 'job-missing-tools',
      projectId: 'project-missing-tools',
      kind: 'gltf.convert',
      payload: { codecId: 'gltf', optimize: true },
      status: 'running',
      attemptCount: 1,
      maxAttempts: 3,
      leaseMs: 30000,
      createdAt: new Date().toISOString()
    };
    let failedMessage = '';
    const backend = createBackendStub(async (name) => {
      if (name === 'list_capabilities') {
        return {
          ok: true,
          data: {
            pluginVersion: 'test',
            blockbenchVersion: 'test',
            authoring: { enabled: true, animations: true },
            limits: { maxCubes: 4096, maxTextureSize: 1024, maxAnimationSeconds: 120 },
            toolAvailability: {
              paint_faces: {
                available: false,
                reason: 'disabled_in_profile'
              }
            }
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
    const store = {
      claimNextJob: async () => claimedJob,
      completeJob: async () => {
        throw new Error('completeJob should not run when required tools are unavailable');
      },
      failJob: async (_jobId: string, message: string) => {
        failedMessage = message;
        return { ...claimedJob, status: 'failed', error: message };
      },
      getProject: async () => ({
        projectId: claimedJob.projectId,
        workspaceId: 'ws-test',
        name: 'project-missing-tools',
        parentFolderId: null,
        revision: 1,
        hasGeometry: true,
        hierarchy: [{ id: 'bone-root', name: 'root', kind: 'bone', children: [] }],
        animations: [],
        stats: { bones: 1, cubes: 1 },
        textureSources: [],
        textures: [
          {
            textureId: 'tex-main',
            name: 'main',
            width: 16,
            height: 16,
            faceCount: 1,
            imageDataUrl: 'data:image/png;base64,AAAA',
            faces: [],
            uvEdges: []
          }
        ]
      })
    } satisfies NativePipelineStorePort;

    await processOneNativeJob({
      workerId: 'worker-1',
      logger,
      enabled: true,
      backend,
      store
    });

    assert.equal(failedMessage.includes('native job required MCP tools unavailable'), true);
    assert.equal(failedMessage.includes('paint_faces'), true);
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

    const backend = createBackendStub(async (name) => {
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
