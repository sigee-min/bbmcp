import assert from 'node:assert/strict';

import { NativePipelineStore } from '../src/nativePipeline/store';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    const store = new NativePipelineStore();

    const allProjects = store.listProjects();
    assert.ok(allProjects.length >= 3);

    const filtered = store.listProjects('lynx');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.name, 'Desert Lynx');

    const job = store.submitJob({
      projectId: 'project-a',
      kind: 'gltf.convert'
    });
    assert.equal(job.status, 'queued');
    assert.equal(job.attemptCount, 0);
    assert.equal(job.maxAttempts, 3);
    assert.equal(job.leaseMs, 30000);

    const claimed = store.claimNextJob('worker-1');
    assert.equal(claimed?.id, job.id);
    assert.equal(claimed?.status, 'running');
    assert.equal(claimed?.workerId, 'worker-1');
    assert.equal(claimed?.attemptCount, 1);
    assert.equal(typeof claimed?.leaseExpiresAt, 'string');

    const completed = store.completeJob(job.id, { ok: true });
    assert.equal(completed?.status, 'completed');
    assert.deepEqual(completed?.result, { ok: true });

    const events = store.getProjectEventsSince('project-a', 0);
    assert.ok(events.length >= 1);
    assert.equal(events.at(-1)?.event, 'project_snapshot');

    const failedJob = store.submitJob({
      projectId: 'project-a',
      kind: 'texture.preflight',
      maxAttempts: 1
    });
    const runningFailedJob = store.claimNextJob('worker-2');
    assert.equal(runningFailedJob?.id, failedJob.id);
    const failed = store.failJob(failedJob.id, 'boom');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'boom');
    assert.equal(failed?.deadLetter, true);

    const listedJobs = store.listProjectJobs('project-a');
    assert.equal(listedJobs.some((candidate) => candidate.id === job.id), true);
    assert.equal(listedJobs.some((candidate) => candidate.id === failedJob.id), true);

    const retryable = store.submitJob({
      projectId: 'project-a',
      kind: 'retry.convert',
      maxAttempts: 2,
      leaseMs: 5000
    });
    const runningRetryable = store.claimNextJob('worker-3');
    assert.equal(runningRetryable?.id, retryable.id);
    assert.equal(runningRetryable?.attemptCount, 1);
    const queuedAgain = store.failJob(retryable.id, 'temporary');
    assert.equal(queuedAgain?.status, 'queued');
    assert.equal(typeof queuedAgain?.nextRetryAt, 'string');

    const blockedRetry = store.claimNextJob('worker-4');
    assert.equal(blockedRetry, null);

    const originalNow = Date.now;
    if (queuedAgain?.nextRetryAt) {
      const retryAt = Date.parse(queuedAgain.nextRetryAt);
      assert.equal(Number.isFinite(retryAt), true);
      if (Number.isFinite(retryAt)) {
        Date.now = () => retryAt + 1;
      }
    }

    let secondClaim: ReturnType<typeof store.claimNextJob>;
    try {
      secondClaim = store.claimNextJob('worker-5');
    } finally {
      Date.now = originalNow;
    }
    assert.equal(secondClaim?.id, retryable.id);
    assert.equal(secondClaim?.attemptCount, 2);
    const finalFailure = store.failJob(retryable.id, 'still failing');
    assert.equal(finalFailure?.status, 'failed');
    assert.equal(finalFailure?.deadLetter, true);

    const constrained = store.submitJob({
      projectId: 'project-a',
      kind: 'lease.clamp',
      maxAttempts: 999,
      leaseMs: 1
    });
    assert.equal(constrained.maxAttempts, 10);
    assert.equal(constrained.leaseMs, 5000);
    const constrainedClaim = store.claimNextJob('worker-6');
    assert.equal(constrainedClaim?.id, constrained.id);
    const constrainedComplete = store.completeJob(constrained.id, { ok: true });
    assert.equal(constrainedComplete?.status, 'completed');

    const expiring = store.submitJob({
      projectId: 'project-a',
      kind: 'lease.expiry',
      maxAttempts: 3,
      leaseMs: 5000
    });
    const firstLeaseClaim = store.claimNextJob('worker-7');
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

    let recoveredClaim: ReturnType<typeof store.claimNextJob>;
    try {
      recoveredClaim = store.claimNextJob('worker-8');
    } finally {
      Date.now = leaseNow;
    }
    assert.equal(recoveredClaim?.id, expiring.id);
    assert.equal(recoveredClaim?.workerId, 'worker-8');
    assert.equal(recoveredClaim?.attemptCount, 2);
  })()
);
