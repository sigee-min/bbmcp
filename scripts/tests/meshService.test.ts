import assert from 'node:assert/strict';

import { ProjectSession } from '../../src/session';
import { MeshService } from '../../src/usecases/model/MeshService';
import type { EditorPort } from '../../src/ports/editor';
import { MODEL_MESH_FACE_UV_AUTO_ONLY } from '../../src/shared/messages';
import { createEditorStub } from './fakes';

type MeshHarness = {
  session: ProjectSession;
  service: MeshService;
  calls: {
    addMesh: number;
    updateMesh: number;
    deleteMesh: number;
  };
};

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

const createHarness = (options?: {
  ensureActiveError?: { code: 'invalid_state'; message: string };
  ensureRevisionError?: { code: 'stale_revision'; message: string };
  addMeshError?: { code: string; message: string };
  updateMeshError?: { code: string; message: string };
  deleteMeshError?: { code: string; message: string };
}): MeshHarness => {
  const session = new ProjectSession();
  session.create('Java Block/Item', 'demo');
  const baseEditor = createEditorStub();
  const calls = {
    addMesh: 0,
    updateMesh: 0,
    deleteMesh: 0
  };
  const editor: EditorPort = {
    ...baseEditor,
    addMesh: (_params) => {
      calls.addMesh += 1;
      return options?.addMeshError ?? null;
    },
    updateMesh: (_params) => {
      calls.updateMesh += 1;
      return options?.updateMeshError ?? null;
    },
    deleteMesh: (_params) => {
      calls.deleteMesh += 1;
      return options?.deleteMeshError ?? null;
    },
    getProjectTextureResolution: () => ({ width: 64, height: 64 })
  };
  const service = new MeshService({
    session,
    editor,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => options?.ensureActiveError ?? null,
    ensureRevisionMatch: () => options?.ensureRevisionError ?? null
  });
  return { session, service, calls };
};

{
  const { service, calls } = createHarness();
  const res = service.addMesh({ name: '', vertices: triVertices(), faces: triFaces() });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
  assert.equal(calls.addMesh, 0);
}

{
  const { service, session, calls } = createHarness();
  session.addBone({ id: 'root-id', name: 'root', pivot: [0, 0, 0] });
  const res = service.addMesh({
    id: 'mesh-1',
    name: 'wing',
    vertices: triVertices(),
    faces: triFaces()
  });
  assert.equal(res.ok, true);
  assert.equal(calls.addMesh, 1);
  const snapshot = session.snapshot();
  assert.equal(snapshot.meshes?.length, 1);
  assert.equal(snapshot.meshes?.[0]?.name, 'wing');
  assert.equal(snapshot.meshes?.[0]?.bone, 'root');
  assert.equal(snapshot.meshes?.[0]?.faces?.[0]?.uv?.length, 3);
  assert.equal(snapshot.meshes?.[0]?.uvPolicy?.symmetryAxis, 'none');
}

{
  const { service, calls } = createHarness();
  const res = service.addMesh({
    name: 'bad_uv',
    vertices: triVertices(),
    faces: [{ vertices: ['v0', 'v1', 'v2'], uv: [{ vertexId: 'v0', uv: [0, 0] }] }]
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, MODEL_MESH_FACE_UV_AUTO_ONLY);
  }
  assert.equal(calls.addMesh, 0);
}

{
  const { service, session, calls } = createHarness();
  assert.equal(service.addMesh({ name: 'body', vertices: triVertices(), faces: triFaces() }).ok, true);
  const res = service.updateMesh({
    name: 'body',
    newName: 'body_main',
    uvPolicy: { symmetryAxis: 'x', texelDensity: 4, padding: 2 },
    vertices: [
      { id: 'v0', pos: [0, 0, 0] },
      { id: 'v1', pos: [2, 0, 0] },
      { id: 'v2', pos: [0, 2, 0] }
    ],
    faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }]
  });
  assert.equal(res.ok, true);
  assert.equal(calls.updateMesh, 1);
  const snapshot = session.snapshot();
  assert.equal(snapshot.meshes?.[0]?.name, 'body_main');
  assert.equal(snapshot.meshes?.[0]?.vertices?.[1]?.pos?.[0], 2);
  assert.equal(snapshot.meshes?.[0]?.uvPolicy?.symmetryAxis, 'x');
  assert.equal(snapshot.meshes?.[0]?.faces?.[0]?.uv?.length, 3);
}

{
  const { service, calls } = createHarness();
  assert.equal(service.addMesh({ name: 'body', vertices: triVertices(), faces: triFaces() }).ok, true);
  const res = service.updateMesh({
    name: 'body',
    faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'], uv: [{ vertexId: 'v0', uv: [0, 0] }] }]
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, MODEL_MESH_FACE_UV_AUTO_ONLY);
  }
  assert.equal(calls.updateMesh, 0);
}

{
  const { service, calls } = createHarness();
  assert.equal(service.addMesh({ name: 'm1', vertices: triVertices(), faces: triFaces() }).ok, true);
  assert.equal(service.addMesh({ name: 'm2', vertices: triVertices(), faces: triFaces() }).ok, true);
  const res = service.deleteMesh({ names: ['m1', 'm2'] });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.deleted.length, 2);
  assert.equal(calls.deleteMesh, 2);
}
