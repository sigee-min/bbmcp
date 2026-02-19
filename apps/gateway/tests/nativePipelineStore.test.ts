import assert from 'node:assert/strict';

import { NativePipelineStore } from '@ashfox/native-pipeline/testing';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    assert.equal(typeof require.resolve('@ashfox/native-pipeline/testing'), 'string');
    assert.equal(typeof NativePipelineStore, 'function');

    const store = new NativePipelineStore();

    const allProjects = await store.listProjects();
    assert.ok(allProjects.length >= 3);
    const findProjectIdByName = (name: string): string => {
      const project = allProjects.find((candidate) => candidate.name === name);
      assert.ok(project, `missing seeded project: ${name}`);
      return project.projectId;
    };
    const forestFoxProjectId = findProjectIdByName('Forest Fox');
    const emptyTemplateProjectId = findProjectIdByName('Empty Template');
    type HierarchyEntry = { kind: 'bone' | 'cube'; children: HierarchyEntry[] };
    const countHierarchy = (nodes: readonly HierarchyEntry[]): { bones: number; cubes: number } => {
      let bones = 0;
      let cubes = 0;
      const stack: HierarchyEntry[] = [...nodes];
      while (stack.length > 0) {
        const next = stack.pop();
        if (!next) {
          continue;
        }
        if (next.kind === 'bone') {
          bones += 1;
        } else {
          cubes += 1;
        }
        if (next.children.length > 0) {
          stack.push(...next.children);
        }
      }
      return { bones, cubes };
    };

    const forestSeed = await store.getProject(forestFoxProjectId);
    assert.ok(forestSeed);
    const forestSeedCounts = countHierarchy(forestSeed.hierarchy);
    assert.equal(forestSeed?.stats.bones, forestSeedCounts.bones);
    assert.equal(forestSeed?.stats.cubes, forestSeedCounts.cubes);

    const filtered = await store.listProjects('lynx');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, 'Desert Lynx');

    const initialTree = await store.getProjectTree();
    assert.equal(initialTree.maxFolderDepth, 3);
    assert.equal(initialTree.roots.length >= 1, true);

    const workFolder = await store.createFolder({ name: 'Work' });
    const sprintFolder = await store.createFolder({ name: 'Sprint', parentFolderId: workFolder.folderId });
    const alphaProject = await store.createProject({
      name: 'Alpha',
      parentFolderId: sprintFolder.folderId
    });
    assert.equal(alphaProject.parentFolderId, sprintFolder.folderId);

    const renamedAlpha = await store.renameProject(alphaProject.projectId, 'Alpha v2');
    assert.equal(renamedAlpha?.name, 'Alpha v2');

    const movedAlpha = await store.moveProject({
      projectId: alphaProject.projectId,
      parentFolderId: null,
      index: 0
    });
    assert.equal(movedAlpha?.parentFolderId, null);

    const stableFolder = await store.createFolder({ name: 'Stable Folder' });
    const stableProject = await store.createProject({
      name: 'Stable Project',
      parentFolderId: stableFolder.folderId
    });
    const movedStableProject = await store.moveProject({
      projectId: stableProject.projectId,
      parentFolderId: null,
      index: 0
    });
    assert.equal(movedStableProject?.parentFolderId, null);
    await store.moveFolder({
      folderId: stableFolder.folderId,
      parentFolderId: null,
      index: 0
    });
    const stableTree = await store.getProjectTree();
    const stableFolderNode = stableTree.roots.find(
      (node) => node.kind === 'folder' && node.folderId === stableFolder.folderId
    );
    assert.ok(stableFolderNode && stableFolderNode.kind === 'folder');
    if (stableFolderNode && stableFolderNode.kind === 'folder') {
      assert.equal(
        stableFolderNode.children.some(
          (node) => node.kind === 'project' && node.projectId === stableProject.projectId
        ),
        false
      );
    }
    assert.equal((await store.getProject(stableProject.projectId))?.parentFolderId, null);

    const reorderFolder = await store.createFolder({ name: 'Reorder Bucket' });
    const reorderA = await store.createProject({ name: 'Reorder-A', parentFolderId: reorderFolder.folderId });
    const reorderB = await store.createProject({ name: 'Reorder-B', parentFolderId: reorderFolder.folderId });
    const reorderC = await store.createProject({ name: 'Reorder-C', parentFolderId: reorderFolder.folderId });
    await store.moveProject({
      projectId: reorderA.projectId,
      parentFolderId: reorderFolder.folderId,
      index: 2
    });
    const reorderTree = await store.getProjectTree();
    const reorderFolderNode = reorderTree.roots.find(
      (node) => node.kind === 'folder' && node.folderId === reorderFolder.folderId
    );
    assert.ok(reorderFolderNode && reorderFolderNode.kind === 'folder');
    if (reorderFolderNode && reorderFolderNode.kind === 'folder') {
      const childProjectOrder = reorderFolderNode.children.flatMap((node) =>
        node.kind === 'project' ? [node.projectId] : []
      );
      assert.deepEqual(childProjectOrder, [reorderB.projectId, reorderA.projectId, reorderC.projectId]);
    }

    const renamedSprint = await store.renameFolder(sprintFolder.folderId, 'Sprint A');
    assert.equal(renamedSprint?.name, 'Sprint A');

    const betaProject = await store.createProject({
      name: 'Beta',
      parentFolderId: sprintFolder.folderId
    });
    const deletedWork = await store.deleteFolder(workFolder.folderId);
    assert.equal(deletedWork, true);
    assert.equal(await store.getProject(betaProject.projectId), null);
    assert.equal((await store.getProject(alphaProject.projectId))?.projectId, alphaProject.projectId);

    const depth1 = await store.createFolder({ name: 'Depth-1' });
    const depth2 = await store.createFolder({ name: 'Depth-2', parentFolderId: depth1.folderId });
    const depth3 = await store.createFolder({ name: 'Depth-3', parentFolderId: depth2.folderId });
    await assert.rejects(
      () => store.createFolder({ name: 'Depth-4', parentFolderId: depth3.folderId }),
      /depth limit/i
    );
    await assert.rejects(
      () =>
        store.moveFolder({
          folderId: depth1.folderId,
          parentFolderId: depth3.folderId
        }),
      /descendant/i
    );
    await store.deleteFolder(depth1.folderId);

    const projectABefore = await store.getProject(forestFoxProjectId);
    assert.ok(projectABefore);

    const job = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'gltf.convert'
    });
    assert.equal(job.status, 'queued');
    assert.equal(job.attemptCount, 0);
    assert.equal(job.maxAttempts, 3);
    assert.equal(job.leaseMs, 30000);

    const claimed = await store.claimNextJob('worker-1');
    assert.equal(claimed?.id, job.id);
    assert.equal(claimed?.status, 'running');
    assert.equal(claimed?.workerId, 'worker-1');
    assert.equal(claimed?.attemptCount, 1);
    assert.equal(typeof claimed?.leaseExpiresAt, 'string');

    const completed = await store.completeJob(job.id, {
      kind: 'gltf.convert',
      output: { ok: true }
    });
    assert.equal(completed?.status, 'completed');
    assert.deepEqual(completed?.result, {
      kind: 'gltf.convert',
      output: { ok: true }
    });
    const projectAAfterNoDelta = await store.getProject(forestFoxProjectId);
    assert.ok(projectAAfterNoDelta);
    assert.equal(projectAAfterNoDelta?.stats.bones, projectABefore?.stats.bones);
    assert.equal(projectAAfterNoDelta?.stats.cubes, projectABefore?.stats.cubes);
    assert.equal(projectAAfterNoDelta?.hasGeometry, projectABefore?.hasGeometry);

    const projectCBefore = await store.getProject(emptyTemplateProjectId);
    assert.ok(projectCBefore);
    assert.equal(projectCBefore?.hasGeometry, false);

    const firstLock = await store.acquireProjectLock({
      projectId: forestFoxProjectId,
      ownerAgentId: 'agent-alpha',
      ownerSessionId: 'session-alpha'
    });
    assert.equal(firstLock.ownerAgentId, 'agent-alpha');
    const renewedLock = await store.acquireProjectLock({
      projectId: forestFoxProjectId,
      ownerAgentId: 'agent-alpha',
      ownerSessionId: 'session-alpha'
    });
    assert.equal(renewedLock.token, firstLock.token);
    await assert.rejects(
      () =>
        store.acquireProjectLock({
          projectId: forestFoxProjectId,
          ownerAgentId: 'agent-beta',
          ownerSessionId: 'session-beta'
        }),
      /Project lock conflict/
    );
    const heldLock = await store.getProjectLock(forestFoxProjectId);
    assert.equal(heldLock?.ownerAgentId, 'agent-alpha');
    assert.equal(
      await store.releaseProjectLock({
        projectId: forestFoxProjectId,
        ownerAgentId: 'agent-beta',
        ownerSessionId: 'session-beta'
      }),
      false
    );
    assert.equal(
      await store.releaseProjectLock({
        projectId: forestFoxProjectId,
        ownerAgentId: 'agent-alpha',
        ownerSessionId: 'session-alpha'
      }),
      true
    );
    assert.equal(await store.getProjectLock(forestFoxProjectId), null);

    const expiringLock = await store.acquireProjectLock({
      projectId: emptyTemplateProjectId,
      ownerAgentId: 'agent-expire',
      ownerSessionId: 'session-expire',
      ttlMs: 5000
    });
    const originalNowForLock = Date.now;
    try {
      const expiresAt = Date.parse(expiringLock.expiresAt);
      Date.now = () => expiresAt + 1;
      assert.equal(await store.getProjectLock(emptyTemplateProjectId), null);
    } finally {
      Date.now = originalNowForLock;
    }
    assert.equal(await store.releaseProjectLocksByOwner('agent-expire'), 0);

    const projected = await store.submitJob({
      projectId: emptyTemplateProjectId,
      kind: 'gltf.convert'
    });
    const projectedRunning = await store.claimNextJob('worker-projection');
    assert.equal(projectedRunning?.id, projected.id);
    const projectedCompleted = await store.completeJob(projected.id, {
      kind: 'gltf.convert',
      status: 'converted',
      hasGeometry: true,
      hierarchy: [
        {
          id: 'bone-root',
          name: 'root',
          kind: 'bone',
          children: [
            { id: 'cube-body', name: 'body', kind: 'cube', children: [] },
            { id: 'cube-head', name: 'head', kind: 'cube', children: [] }
          ]
        }
      ],
      geometryDelta: {
        bones: 1,
        cubes: 2
      }
    });
    assert.equal(projectedCompleted?.status, 'completed');
    const projectCAfterProjection = await store.getProject(emptyTemplateProjectId);
    assert.ok(projectCAfterProjection);
    assert.equal(projectCAfterProjection?.stats.bones, 1);
    assert.equal(projectCAfterProjection?.stats.cubes, 2);
    assert.equal(projectCAfterProjection?.hasGeometry, true);

    const events = await store.getProjectEventsSince(forestFoxProjectId, 0);
    assert.ok(events.length >= 1);
    assert.equal(events.at(-1)?.event, 'project_snapshot');

    const failedJob = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'texture.preflight',
      maxAttempts: 1
    });
    const runningFailedJob = await store.claimNextJob('worker-2');
    assert.equal(runningFailedJob?.id, failedJob.id);
    const failed = await store.failJob(failedJob.id, 'boom');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'boom');
    assert.equal(failed?.deadLetter, true);

    const listedJobs = await store.listProjectJobs(forestFoxProjectId);
    assert.equal(listedJobs.some((candidate) => candidate.id === job.id), true);
    assert.equal(listedJobs.some((candidate) => candidate.id === failedJob.id), true);

    const nonObjectPayload = JSON.parse('"bad"');
    await assert.rejects(
      () =>
        store.submitJob({
          projectId: forestFoxProjectId,
          kind: 'gltf.convert',
          payload: nonObjectPayload as never
        }),
      /payload must be an object/
    );
    await assert.rejects(
      () =>
        store.submitJob({
          projectId: forestFoxProjectId,
          kind: 'custom.unsupported' as never
        }),
      /kind must be one of: gltf.convert, texture.preflight/
    );

    const retryable = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'gltf.convert',
      maxAttempts: 2,
      leaseMs: 5000
    });
    const runningRetryable = await store.claimNextJob('worker-3');
    assert.equal(runningRetryable?.id, retryable.id);
    assert.equal(runningRetryable?.attemptCount, 1);
    const queuedAgain = await store.failJob(retryable.id, 'temporary');
    assert.equal(queuedAgain?.status, 'queued');
    assert.equal(typeof queuedAgain?.nextRetryAt, 'string');

    const blockedRetry = await store.claimNextJob('worker-4');
    assert.equal(blockedRetry, null);

    const originalNow = Date.now;
    if (queuedAgain?.nextRetryAt) {
      const retryAt = Date.parse(queuedAgain.nextRetryAt);
      assert.equal(Number.isFinite(retryAt), true);
      if (Number.isFinite(retryAt)) {
        Date.now = () => retryAt + 1;
      }
    }

    let secondClaim: Awaited<ReturnType<typeof store.claimNextJob>>;
    try {
      secondClaim = await store.claimNextJob('worker-5');
    } finally {
      Date.now = originalNow;
    }
    assert.equal(secondClaim?.id, retryable.id);
    assert.equal(secondClaim?.attemptCount, 2);
    const finalFailure = await store.failJob(retryable.id, 'still failing');
    assert.equal(finalFailure?.status, 'failed');
    assert.equal(finalFailure?.deadLetter, true);

    const retryLeaseNow = Date.now;
    if (finalFailure?.leaseExpiresAt) {
      const leaseExpiresAt = Date.parse(finalFailure.leaseExpiresAt);
      if (Number.isFinite(leaseExpiresAt)) {
        Date.now = () => leaseExpiresAt + 60_000;
      }
    }
    let deadLetterReclaimAttempt: Awaited<ReturnType<typeof store.claimNextJob>>;
    try {
      deadLetterReclaimAttempt = await store.claimNextJob('worker-dead-letter-reclaim');
    } finally {
      Date.now = retryLeaseNow;
    }
    assert.equal(deadLetterReclaimAttempt?.id === retryable.id, false);

    const constrained = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'texture.preflight',
      maxAttempts: 999,
      leaseMs: 1
    });
    assert.equal(constrained.maxAttempts, 10);
    assert.equal(constrained.leaseMs, 5000);
    const constrainedClaim = await store.claimNextJob('worker-6');
    assert.equal(constrainedClaim?.id, constrained.id);
    const constrainedComplete = await store.completeJob(constrained.id, {
      kind: 'texture.preflight',
      output: { ok: true }
    });
    assert.equal(constrainedComplete?.status, 'completed');

    const expiring = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'gltf.convert',
      maxAttempts: 3,
      leaseMs: 5000
    });
    const firstLeaseClaim = await store.claimNextJob('worker-7');
    assert.equal(firstLeaseClaim?.id, expiring.id);
    assert.equal(firstLeaseClaim?.attemptCount, 1);
    assert.equal(typeof firstLeaseClaim?.leaseExpiresAt, 'string');

    const leaseNow = Date.now;
    if (firstLeaseClaim?.leaseExpiresAt) {
      const leaseExpiresAt = Date.parse(firstLeaseClaim.leaseExpiresAt);
      if (Number.isFinite(leaseExpiresAt)) {
        Date.now = () => leaseExpiresAt + 1;
      }
    }

    let recoveredClaim: Awaited<ReturnType<typeof store.claimNextJob>>;
    try {
      recoveredClaim = await store.claimNextJob('worker-8');
    } finally {
      Date.now = leaseNow;
    }
    assert.equal(recoveredClaim?.id, expiring.id);
    assert.equal(recoveredClaim?.workerId, 'worker-8');
    assert.equal(recoveredClaim?.attemptCount, 2);

    const concurrencyCandidate = await store.submitJob({
      projectId: forestFoxProjectId,
      kind: 'texture.preflight',
      maxAttempts: 2,
      leaseMs: 5000
    });
    const [firstRaceClaim, secondRaceClaim] = await Promise.all([
      store.claimNextJob('worker-race-1'),
      store.claimNextJob('worker-race-2')
    ]);
    const claims = [firstRaceClaim, secondRaceClaim].filter((entry) => entry?.id === concurrencyCandidate.id);
    assert.equal(claims.length, 1);
    assert.equal(claims[0]?.status, 'running');
    const winner = claims[0]?.workerId;
    assert.equal(winner === 'worker-race-1' || winner === 'worker-race-2', true);
    const completedRace = await store.completeJob(concurrencyCandidate.id, {
      kind: 'texture.preflight',
      output: { ok: true, winner }
    });
    assert.equal(completedRace?.status, 'completed');
  })()
);
