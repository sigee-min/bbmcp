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

    const claimed = store.claimNextJob('worker-1');
    assert.equal(claimed?.id, job.id);
    assert.equal(claimed?.status, 'running');
    assert.equal(claimed?.workerId, 'worker-1');

    const completed = store.completeJob(job.id, { ok: true });
    assert.equal(completed?.status, 'completed');
    assert.deepEqual(completed?.result, { ok: true });

    const events = store.getProjectEventsSince('project-a', 0);
    assert.ok(events.length >= 1);
    assert.equal(events.at(-1)?.event, 'project_snapshot');

    const failedJob = store.submitJob({
      projectId: 'project-a',
      kind: 'texture.preflight'
    });
    const runningFailedJob = store.claimNextJob('worker-2');
    assert.equal(runningFailedJob?.id, failedJob.id);
    const failed = store.failJob(failedJob.id, 'boom');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'boom');

    const listedJobs = store.listProjectJobs('project-a');
    assert.equal(listedJobs.some((candidate) => candidate.id === job.id), true);
    assert.equal(listedJobs.some((candidate) => candidate.id === failedJob.id), true);
  })()
);
