import assert from 'node:assert/strict';

import type { Capabilities } from '../src/types';
import { ProjectSession } from '../src/session';
import type { EditorPort } from '../src/ports/editor';
import { MODEL_MESH_UNSUPPORTED_FORMAT } from '../src/shared/messages';
import { ModelService } from '../src/usecases/ModelService';
import { createEditorStub } from './fakes';

const triVertices = () => [
  { id: 'v0', pos: [0, 0, 0] as [number, number, number] },
  { id: 'v1', pos: [1, 0, 0] as [number, number, number] },
  { id: 'v2', pos: [0, 1, 0] as [number, number, number] }
];

const triFaces = () => [
  {
    id: 'f0',
    vertices: ['v0', 'v1', 'v2']
  }
];

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [
    {
      format: 'Java Block/Item',
      animations: false,
      enabled: true,
      flags: { meshes: false }
    }
  ],
  limits: { maxCubes: 256, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const createService = () => {
  const session = new ProjectSession();
  session.create('Java Block/Item', 'demo');
  let addCalls = 0;
  let updateCalls = 0;
  let deleteCalls = 0;
  const editor: EditorPort = {
    ...createEditorStub(),
    addMesh: () => {
      addCalls += 1;
      return null;
    },
    updateMesh: () => {
      updateCalls += 1;
      return null;
    },
    deleteMesh: () => {
      deleteCalls += 1;
      return null;
    }
  };
  const service = new ModelService({
    session,
    editor,
    capabilities,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => null,
    ensureRevisionMatch: () => null
  });
  return {
    service,
    getCalls: () => ({ addCalls, updateCalls, deleteCalls })
  };
};

{
  const { service, getCalls } = createService();
  const res = service.addMesh({
    name: 'wing',
    vertices: triVertices(),
    faces: triFaces()
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, MODEL_MESH_UNSUPPORTED_FORMAT);
  }
  assert.equal(getCalls().addCalls, 0);
}

{
  const { service, getCalls } = createService();
  const res = service.updateMesh({ name: 'wing' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, MODEL_MESH_UNSUPPORTED_FORMAT);
  }
  assert.equal(getCalls().updateCalls, 0);
}

{
  const { service, getCalls } = createService();
  const res = service.deleteMesh({ name: 'wing' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, MODEL_MESH_UNSUPPORTED_FORMAT);
  }
  assert.equal(getCalls().deleteCalls, 0);
}
