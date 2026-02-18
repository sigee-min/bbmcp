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

    const filtered = await store.listProjects('lynx');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, 'Desert Lynx');
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
      geometryDelta: {
        bones: 1,
        cubes: 2
      }
    });
    assert.equal(projectedCompleted?.status, 'completed');
    const projectCAfterProjection = await store.getProject(emptyTemplateProjectId);
    assert.ok(projectCAfterProjection);
    assert.equal(projectCAfterProjection?.stats.bones, (projectCBefore?.stats.bones ?? 0) + 1);
    assert.equal(projectCAfterProjection?.stats.cubes, (projectCBefore?.stats.cubes ?? 0) + 2);
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
