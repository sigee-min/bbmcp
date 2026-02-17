import assert from 'node:assert/strict';

import { ProjectSession } from '../src/session';
import { ToolService } from '../src/usecases/ToolService';
import type { Capabilities } from '/contracts/types/internal';
import { registerAsync } from './helpers';
import {
  createEditorStubWithState,
  createFormatPortStub,
  createHostPortStub,
  createMockImage,
  createResourceStoreStub,
  createSnapshotPortStub,
  createTextureRendererStub,
  createTmpStoreStub
} from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: {
    animations: true,
    enabled: true,
    flags: {
      meshes: true,
      boneRig: true
    }
  },
  limits: {
    maxCubes: 2048,
    maxTextureSize: 2048,
    maxAnimationSeconds: 120
  }
};

const session = new ProjectSession();
const editorState = createEditorStubWithState({
  textureResolution: { width: 32, height: 32 }
});

const exportCalls = {
  native: 0,
  gltf: 0
};

const service = new ToolService({
  session,
  capabilities,
  editor: editorState.editor,
  formats: createFormatPortStub('geckolib_model', 'GeckoLib', {
    perTextureUvSize: true
  }),
  snapshot: createSnapshotPortStub(session),
  exporter: {
    exportNative: () => {
      exportCalls.native += 1;
      return null;
    },
    exportGltf: () => {
      exportCalls.gltf += 1;
      return null;
    }
  },
  host: createHostPortStub(),
  textureRenderer: createTextureRendererStub(),
  tmpStore: createTmpStoreStub(),
  resources: createResourceStoreStub(),
  policies: {
    autoAttachActiveProject: true,
    exportPolicy: 'strict',
    autoCreateProjectTexture: false
  }
});

const ensureRes = service.ensureProject({
  name: 'generic_flow',
  match: 'none',
  onMissing: 'create'
});
assert.equal(ensureRes.ok, true);

const boneRes = service.addBone({
  name: 'root',
  pivot: [0, 0, 0]
});
assert.equal(boneRes.ok, true);

const cubeRes = service.addCube({
  name: 'body_cube',
  bone: 'root',
  from: [0, 0, 0],
  to: [4, 4, 4]
});
assert.equal(cubeRes.ok, true);

const importTextureRes = service.importTexture({
  name: 'atlas',
  image: createMockImage('data:image/png;base64,AAAA'),
  width: 32,
  height: 32
});
assert.equal(importTextureRes.ok, true);

const assignTextureRes = service.assignTexture({
  textureName: 'atlas',
  cubeNames: ['body_cube'],
  faces: ['north']
});
assert.equal(assignTextureRes.ok, true);

const clipRes = service.createAnimationClip({
  name: 'idle',
  length: 1,
  loop: true,
  fps: 24
});
assert.equal(clipRes.ok, true);

const poseRes = service.setFramePose({
  clip: 'idle',
  frame: 0,
  bones: [{ name: 'root', rot: [0, 12, 0] }]
});
assert.equal(poseRes.ok, true);

const triggerRes = service.setTriggerKeyframes({
  clip: 'idle',
  channel: 'sound',
  keys: [{ time: 0, value: 'sfx.idle' }]
});
assert.equal(triggerRes.ok, true);

const stateRes = service.getProjectState({ detail: 'full' });
assert.equal(stateRes.ok, true);
if (stateRes.ok) {
  const cube = stateRes.value.project.cubes.find((entry) => entry.name === 'body_cube');
  const anim = stateRes.value.project.animations.find((entry) => entry.name === 'idle');
  assert.ok(cube);
  assert.ok(anim);
}

registerAsync(
  service.exportModel({ format: 'gltf', destPath: './out/generic_flow.glb' }).then((exportRes) => {
    assert.equal(exportRes.ok, true);
    assert.equal(exportCalls.gltf, 0);
    assert.equal(exportCalls.native, 0);
    if (exportRes.ok) {
      assert.equal(exportRes.value.path.endsWith('.gltf'), true);
      assert.equal(exportRes.value.stage, 'fallback');
      assert.equal(exportRes.value.warnings?.includes('GLT-WARN-DEST_GLB_NOT_SUPPORTED'), true);
      assert.equal(exportRes.value.warnings?.includes('GLT-WARN-TRIGGERS_DROPPED'), true);
      assert.equal(editorState.state.writes.length, 1);
      assert.equal(editorState.state.writes[0]!.path, './out/generic_flow.gltf');
    }
  })
);
