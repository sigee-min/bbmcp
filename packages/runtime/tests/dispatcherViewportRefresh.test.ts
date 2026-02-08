import assert from 'node:assert/strict';

import { ToolDispatcherImpl } from '../src/dispatcher';
import { ProjectSession } from '../src/session';
import type { Capabilities } from '../src/types';
import type { ViewportRefreshRequest } from '../src/ports/viewportRefresher';
import { ToolService } from '../src/usecases/ToolService';
import { noopLog, registerAsync } from './helpers';
import {
  createEditorStub,
  createExportPortStub,
  createFormatPortStub,
  createHostPortStub,
  createResourceStoreStub,
  createSnapshotPortStub,
  createTextureRendererStub,
  createTmpStoreStub
} from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [{ format: 'Java Block/Item', animations: true, enabled: true }],
  limits: { maxCubes: 32, maxTextureSize: 64, maxAnimationSeconds: 8 }
};

{
  registerAsync((async () => {
    const session = new ProjectSession();
    const refreshCalls: ViewportRefreshRequest[] = [];
    const service = new ToolService({
      session,
      capabilities,
      editor: createEditorStub(),
      formats: createFormatPortStub(),
      snapshot: createSnapshotPortStub(session),
      exporter: createExportPortStub('ok'),
      host: createHostPortStub(),
      textureRenderer: createTextureRendererStub(),
      tmpStore: createTmpStoreStub(),
      resources: createResourceStoreStub(),
      viewportRefresher: {
        refresh: (request) => {
          refreshCalls.push(request);
        }
      },
      policies: { autoAttachActiveProject: true }
    });

    const ensureRes = service.ensureProject({
      format: 'Java Block/Item',
      name: 'refresh-test',
      match: 'none',
      onMissing: 'create'
    });
    assert.equal(ensureRes.ok, true);

    const seedBone = service.addBone({ name: 'body' });
    assert.equal(seedBone.ok, true);
    const seedAnim = service.createAnimationClip({ name: 'idle', length: 1, loop: true, fps: 20 });
    assert.equal(seedAnim.ok, true);

    const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
      includeStateByDefault: false,
      includeDiffByDefault: false,
      logger: noopLog
    });

    const stateRes = await dispatcher.handle('get_project_state', { detail: 'summary' });
    assert.equal(stateRes.ok, true);
    assert.equal(refreshCalls.length, 0);

    const cubeRes = await dispatcher.handle('add_cube', {
      name: 'body_main',
      from: [-4, 0, -4],
      to: [4, 8, 4]
    });
    assert.equal(cubeRes.ok, true);
    assert.equal(refreshCalls.length, 1);
    assert.deepEqual(refreshCalls[0], { effect: 'geometry', source: 'add_cube' });

    const poseRes = await dispatcher.handle('set_frame_pose', {
      clip: 'idle',
      frame: 0,
      bones: [{ name: 'body', rot: [2, 0, 0] }]
    });
    assert.equal(poseRes.ok, true);
    assert.equal(refreshCalls.length, 2);
    assert.deepEqual(refreshCalls[1], { effect: 'animation', source: 'set_frame_pose' });

    const badCubeRes = await dispatcher.handle('add_cube', {
      name: '',
      from: [0, 0, 0],
      to: [1, 1, 1]
    });
    assert.equal(badCubeRes.ok, false);
    assert.equal(refreshCalls.length, 2);
  })());
}
