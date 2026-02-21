import assert from 'node:assert/strict';

import { NativePipelineStore } from '@ashfox/native-pipeline/testing';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    assert.equal(typeof require.resolve('@ashfox/native-pipeline/testing'), 'string');
    assert.equal(typeof NativePipelineStore, 'function');

    const store = new NativePipelineStore();

    await assert.rejects(() => store.listProjects(), /workspaceId is required/);

    const wsAlpha = 'ws_alpha';
    const wsBeta = 'ws_beta';

    assert.deepEqual(await store.listProjects(undefined, wsAlpha), []);
    assert.equal((await store.getProjectTree(undefined, wsAlpha)).roots.length, 0);

    const alphaProject = await store.createProject({ workspaceId: wsAlpha, name: 'Alpha' });
    const betaProject = await store.createProject({ workspaceId: wsBeta, name: 'Beta' });

    const alphaProjects = await store.listProjects(undefined, wsAlpha);
    const betaProjects = await store.listProjects(undefined, wsBeta);

    assert.equal(alphaProjects.some((project) => project.projectId === alphaProject.projectId), true);
    assert.equal(alphaProjects.some((project) => project.projectId === betaProject.projectId), false);
    assert.equal(betaProjects.some((project) => project.projectId === betaProject.projectId), true);
    assert.equal(betaProjects.some((project) => project.projectId === alphaProject.projectId), false);

    const alphaRootFolder = await store.createFolder({ workspaceId: wsAlpha, name: 'Root Folder' });
    const alphaNestedFolder = await store.createFolder({
      workspaceId: wsAlpha,
      name: 'Nested Folder',
      parentFolderId: alphaRootFolder.folderId
    });

    const alphaNestedProject = await store.createProject({
      workspaceId: wsAlpha,
      name: 'Nested Project',
      parentFolderId: alphaNestedFolder.folderId
    });

    const renamedAlphaNested = await store.renameProject(alphaNestedProject.projectId, 'Nested Project V2', wsAlpha);
    assert.equal(renamedAlphaNested?.name, 'Nested Project V2');

    const movedToRoot = await store.moveProject(
      {
        workspaceId: wsAlpha,
        projectId: alphaNestedProject.projectId,
        parentFolderId: null,
        index: 0
      }
    );
    assert.equal(movedToRoot?.parentFolderId, null);

    const renamedFolder = await store.renameFolder(alphaNestedFolder.folderId, 'Nested Folder V2', wsAlpha);
    assert.equal(renamedFolder?.name, 'Nested Folder V2');

    const deletedFolder = await store.deleteFolder(alphaRootFolder.folderId, wsAlpha);
    assert.equal(deletedFolder, true);

    const crossWorkspaceRead = await store.getProject(alphaNestedProject.projectId, wsBeta);
    assert.equal(crossWorkspaceRead, null);

    const alphaLock = await store.acquireProjectLock({
      workspaceId: wsAlpha,
      projectId: alphaProject.projectId,
      ownerAgentId: 'alpha-agent',
      ownerSessionId: 'alpha-session'
    });
    assert.equal(alphaLock.ownerAgentId, 'alpha-agent');

    await assert.rejects(
      () =>
        store.acquireProjectLock({
          workspaceId: wsAlpha,
          projectId: alphaProject.projectId,
          ownerAgentId: 'alpha-agent-2',
          ownerSessionId: 'alpha-session-2'
        }),
      /Project lock conflict/
    );

    const betaLock = await store.acquireProjectLock({
      workspaceId: wsBeta,
      projectId: betaProject.projectId,
      ownerAgentId: 'beta-agent',
      ownerSessionId: 'beta-session'
    });
    assert.equal(betaLock.ownerAgentId, 'beta-agent');

    assert.equal(
      await store.releaseProjectLock({
        workspaceId: wsAlpha,
        projectId: alphaProject.projectId,
        ownerAgentId: 'alpha-agent',
        ownerSessionId: 'alpha-session'
      }),
      true
    );
    assert.equal(
      await store.releaseProjectLock({
        workspaceId: wsBeta,
        projectId: betaProject.projectId,
        ownerAgentId: 'beta-agent',
        ownerSessionId: 'beta-session'
      }),
      true
    );

    const queued = await store.submitJob({
      workspaceId: wsAlpha,
      projectId: alphaProject.projectId,
      kind: 'gltf.convert'
    });
    assert.equal(queued.status, 'queued');

    const claimed = await store.claimNextJob('worker-alpha', wsAlpha);
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.status, 'running');

    const completed = await store.completeJob(
      queued.id,
      {
        kind: 'gltf.convert',
        output: { ok: true }
      },
      wsAlpha
    );
    assert.equal(completed?.status, 'completed');

    const alphaJobs = await store.listProjectJobs(alphaProject.projectId, wsAlpha);
    assert.equal(alphaJobs.some((job) => job.id === queued.id), true);
    const betaJobsForAlphaProject = await store.listProjectJobs(alphaProject.projectId, wsBeta);
    assert.equal(betaJobsForAlphaProject.length, 0);

    const alphaEvents = await store.getProjectEventsSince(alphaProject.projectId, 0, wsAlpha);
    assert.equal(alphaEvents.length > 0, true);

    const projectedJob = await store.submitJob({
      workspaceId: wsBeta,
      projectId: 'prj_projected_from_job',
      kind: 'texture.preflight'
    });
    assert.equal(projectedJob.status, 'queued');
    assert.ok(await store.getProject('prj_projected_from_job', wsBeta));
    assert.equal(await store.getProject('prj_projected_from_job', wsAlpha), null);

    await store.reset();
    assert.equal((await store.listProjects(undefined, wsAlpha)).length, 0);
    assert.equal((await store.listProjects(undefined, wsBeta)).length, 0);
  })()
);
