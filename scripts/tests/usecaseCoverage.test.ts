import assert from 'node:assert/strict';

import { ProjectSession } from '../../src/session';
import { ToolService } from '../../src/usecases/ToolService';
import type { Capabilities } from '../../src/types';
import { computeTextureUsageId } from '../../src/domain/textureUsage';
import { registerAsync } from './helpers';
import {
  createEditorStubWithState,
  createExportPortStub,
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
  formats: [{ format: 'Java Block/Item', animations: true, enabled: true, flags: { singleTexture: true } }],
  limits: { maxCubes: 32, maxTextureSize: 64, maxAnimationSeconds: 5 }
};

const usage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 2,
      cubes: [
        {
          id: 'cube1',
          name: 'cube',
          faces: [
            { face: 'north', uv: [0, 0, 8, 8] },
            { face: 'south', uv: [0, 0, 8, 8] }
          ]
        }
      ]
    }
  ],
  unresolved: [{ textureRef: 'missing', cubeName: 'cube', face: 'up' }]
};

const session = new ProjectSession();
const editorState = createEditorStubWithState({
  textureUsage: usage,
  textureResolution: { width: 16, height: 16 }
});
const editor = editorState.editor;
const formats = createFormatPortStub();
const snapshot = createSnapshotPortStub(session);
const exporter = createExportPortStub('not_implemented');
const host = createHostPortStub();
const tmpStore = createTmpStoreStub();
const textureRenderer = createTextureRendererStub();
const resources = createResourceStoreStub();

const service = new ToolService({
  session,
  capabilities,
  editor,
  formats,
  snapshot,
  exporter,
  host,
  textureRenderer,
  tmpStore,
  resources,
  policies: { exportPolicy: 'best_effort', autoAttachActiveProject: true }
});

const ensureRes = service.ensureProject({
  format: 'Java Block/Item',
  name: 'demo',
  match: 'none',
  onMissing: 'create'
});
assert.equal(ensureRes.ok, true);

const stateRes = service.getProjectState({ detail: 'full', includeUsage: true });
assert.equal(stateRes.ok, true);
const revision = stateRes.ok ? stateRes.value.project.revision : 'r0';

assert.equal(service.isRevisionRequired(), false);
assert.equal(service.isAutoRetryRevisionEnabled(), false);
assert.ok(service.getUvPolicy());
assert.equal(service.ensureRevisionMatchIfProvided('r1'), null);

const guardValue = service.runWithoutRevisionGuard(() => 1);
assert.equal(guardValue, 1);
registerAsync(service.runWithoutRevisionGuardAsync(async () => 2).then((value) => assert.equal(value, 2)));

const sizeError = service.setProjectTextureResolution({ width: 256, height: 16 });
assert.equal(sizeError.ok, false);
const sizeOk = service.setProjectTextureResolution({ width: 32, height: 32 });
assert.equal(sizeOk.ok, true);

const boneRes = service.addBone({ name: 'arm' });
assert.equal(boneRes.ok, true);
const cubeRes = service.addCube({
  name: 'cube',
  from: [0, 0, 0],
  to: [8, 8, 8]
});
assert.equal(cubeRes.ok, true);

const updateBoneRes = service.updateBone({ name: 'arm', newName: 'arm2', parentRoot: true });
assert.equal(updateBoneRes.ok, true);
const updateCubeRes = service.updateCube({ name: 'cube', newName: 'cube2', boneRoot: true });
assert.equal(updateCubeRes.ok, true);
const extraBoneRes = service.addBone({ name: 'arm3' });
assert.equal(extraBoneRes.ok, true);
const extraCubeRes = service.addCube({
  name: 'cube3',
  from: [1, 1, 1],
  to: [4, 4, 4]
});
assert.equal(extraCubeRes.ok, true);

const importRes = service.importTexture({
  name: 'tex',
  image: createMockImage('data:image/png;base64,AAAA'),
  width: 16,
  height: 16
});
assert.equal(importRes.ok, true);

const unchangedRes = service.updateTexture({
  name: 'tex',
  image: createMockImage('data:image/png;base64,AAAA'),
  width: 16,
  height: 16
});
assert.equal(unchangedRes.ok, false);

const updateRes = service.updateTexture({
  name: 'tex',
  newName: 'tex2',
  image: createMockImage('data:image/png;base64,BBBB'),
  width: 16,
  height: 16
});
assert.equal(updateRes.ok, true);

const readRes = service.readTexture({ name: 'tex2' });
assert.equal(readRes.ok, true);
const readImageRes = service.readTextureImage({ name: 'tex2', saveToTmp: true, tmpPrefix: 'texture' });
assert.equal(readImageRes.ok, true);

const assignRes = service.assignTexture({
  textureName: 'tex2',
  cubeNames: ['cube2'],
  faces: ['north', 'south']
});
assert.equal(assignRes.ok, true);

const invalidFaceUv = service.setFaceUv({ faces: { north: [0, 0, 8, 8] } });
assert.equal(invalidFaceUv.ok, false);

const faceUvRes = service.setFaceUv({
  cubeName: 'cube2',
  faces: { north: [0, 0, 8, 8] }
});
assert.equal(faceUvRes.ok, true);

const preflightRes = service.preflightTexture({ includeUsage: true });
assert.equal(preflightRes.ok, true);
assert.ok(preflightRes.ok && preflightRes.value.warnings.length > 0);

const usageId = computeTextureUsageId(usage);
assert.ok(typeof usageId === 'string' && usageId.length > 0);
const autoUvRes = service.autoUvAtlas({ apply: false });
assert.equal(autoUvRes.ok, false);

const animRes = service.createAnimationClip({ name: 'idle', length: 1, loop: true, fps: 24 });
assert.equal(animRes.ok, true);
const animUpdateRes = service.updateAnimationClip({ name: 'idle', newName: 'idle2', length: 2, loop: false, fps: 12 });
assert.equal(animUpdateRes.ok, true);
const keyRes = service.setKeyframes({
  clip: 'idle2',
  bone: 'arm2',
  channel: 'rot',
  keys: [{ time: 0, value: [0, 0, 0] }]
});
assert.equal(keyRes.ok, true);
const keyResOverwrite = service.setKeyframes({
  clip: 'idle2',
  bone: 'arm2',
  channel: 'rot',
  keys: [{ time: 0, value: [0, 10, 0] }]
});
assert.equal(keyResOverwrite.ok, true);
const keyRes2 = service.setKeyframes({
  clip: 'idle2',
  bone: 'arm2',
  channel: 'rot',
  keys: [{ time: 0.75, value: [0, 20, 0] }]
});
assert.equal(keyRes2.ok, true);
const triggerRes = service.setTriggerKeyframes({
  clip: 'idle2',
  channel: 'sound',
  keys: [{ time: 0, value: 'sound_event' }]
});
assert.equal(triggerRes.ok, true);
const triggerRes2 = service.setTriggerKeyframes({
  clip: 'idle2',
  channel: 'sound',
  keys: [{ time: 0, value: 'sound_event2' }]
});
assert.equal(triggerRes2.ok, true);
const animStateRes = service.getProjectState({ detail: 'full' });
assert.equal(animStateRes.ok, true);
const animState = animStateRes.ok ? animStateRes.value.project : undefined;
const anim = animState?.animations?.find((entry) => entry.name === 'idle2');
assert.ok(anim);
const channel = anim?.channels?.find((entry) => entry.bone === 'arm2' && entry.channel === 'rot');
assert.equal(channel?.keys.length, 2);
assert.equal(channel?.keys[0].time, 0);
assert.equal(channel?.keys[0].value[1], 10);
const trigger = anim?.triggers?.find((entry) => entry.type === 'sound');
assert.equal(trigger?.keys.length, 2);
const animDeleteRes = service.deleteAnimationClip({ name: 'idle2' });
assert.equal(animDeleteRes.ok, true);

const deleteCubeRes = service.deleteCube({ names: ['cube2', 'cube3'] });
assert.equal(deleteCubeRes.ok, true);
assert.equal(deleteCubeRes.ok && deleteCubeRes.value.deleted.length, 2);
const deleteBoneRes = service.deleteBone({ names: ['arm2', 'arm3'] });
assert.equal(deleteBoneRes.ok, true);
assert.equal(deleteBoneRes.ok && deleteBoneRes.value.deleted.length, 2);

const diffRes = service.getProjectDiff({ sinceRevision: revision, detail: 'full' });
assert.equal(diffRes.ok, true);

const validateRes = service.validate({});
assert.equal(validateRes.ok, true);

const exportRes = service.exportModel({ format: 'java_block_item_json', destPath: 'out.json' });
assert.equal(exportRes.ok, true);

const previewSingle = service.renderPreview({ mode: 'fixed', output: 'single', saveToTmp: true });
assert.equal(previewSingle.ok, true);

editorState.state.previewResult = {
  kind: 'sequence',
  frameCount: 2,
  frames: [
    { index: 0, mime: 'image/png', width: 16, height: 16, dataUri: 'data:image/png;base64,AAAA' },
    { index: 1, mime: 'image/png', width: 16, height: 16, dataUri: 'data:image/png;base64,BBBB' }
  ]
};
const previewSeq = service.renderPreview({ mode: 'turntable', output: 'sequence', saveToTmp: true });
assert.equal(previewSeq.ok, true);

const reloadErr = service.reloadPlugins({ confirm: false });
assert.equal(reloadErr.ok, false);
const reloadOk = service.reloadPlugins({ confirm: true, delayMs: 10 });
assert.equal(reloadOk.ok, true);

