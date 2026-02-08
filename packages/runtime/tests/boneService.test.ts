import assert from 'node:assert/strict';

import { ProjectSession } from '../src/session';
import { BoneService } from '../src/usecases/model/BoneService';
import type { EditorPort } from '../src/ports/editor';
import { createEditorStub } from './fakes';

type BoneHarness = {
  session: ProjectSession;
  service: BoneService;
  calls: {
    addBone: number;
    updateBone: number;
    deleteBone: number;
  };
};

const createHarness = (options?: {
  ensureActiveError?: { code: 'invalid_state'; message: string };
  ensureRevisionError?: { code: 'stale_revision'; message: string };
  addBoneError?: { code: string; message: string };
  updateBoneError?: { code: string; message: string };
  deleteBoneError?: { code: string; message: string };
}): BoneHarness => {
  const session = new ProjectSession();
  session.create('Java Block/Item', 'demo');
  const baseEditor = createEditorStub();
  const calls = {
    addBone: 0,
    updateBone: 0,
    deleteBone: 0
  };
  const editor: EditorPort = {
    ...baseEditor,
    addBone: (params) => {
      calls.addBone += 1;
      return options?.addBoneError ?? null;
    },
    updateBone: (params) => {
      calls.updateBone += 1;
      return options?.updateBoneError ?? null;
    },
    deleteBone: (params) => {
      calls.deleteBone += 1;
      return options?.deleteBoneError ?? null;
    }
  };
  const service = new BoneService({
    session,
    editor,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => options?.ensureActiveError ?? null,
    ensureRevisionMatch: () => options?.ensureRevisionError ?? null
  });
  return { session, service, calls };
};

{
  const { service } = createHarness();
  const res = service.addBone({ name: '' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const { service, calls } = createHarness({
    ensureActiveError: { code: 'invalid_state', message: 'inactive' }
  });
  const res = service.addBone({ name: 'arm' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
  assert.equal(calls.addBone, 0);
}

{
  const { service } = createHarness();
  const res = service.addBone({ name: 'arm', parentId: 'missing' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service, calls } = createHarness();
  const addRoot = service.addBone({ id: 'b_root', name: 'root' });
  assert.equal(addRoot.ok, true);
  const addArm = service.addBone({ id: 'b_arm', name: 'arm', parent: 'root' });
  assert.equal(addArm.ok, true);
  assert.equal(calls.addBone, 2);
}

{
  const { service } = createHarness();
  const res = service.addBone({ id: 'b1', name: 'root' });
  assert.equal(res.ok, true);
  const dup = service.addBone({ id: 'b1', name: 'arm' });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.equal(dup.error.code, 'invalid_payload');
}

{
  const { service } = createHarness();
  assert.equal(service.addBone({ name: 'root' }).ok, true);
  assert.equal(service.addBone({ name: 'arm', parent: 'root' }).ok, true);
  assert.equal(service.addBone({ name: 'hand', parent: 'arm' }).ok, true);
  const res = service.updateBone({ name: 'arm', parent: 'hand' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service } = createHarness();
  assert.equal(service.addBone({ name: 'root' }).ok, true);
  const res = service.updateBone({ name: 'root', parent: 'root' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service } = createHarness();
  assert.equal(service.addBone({ id: 'root-id', name: 'root' }).ok, true);
  const res = service.updateBone({ name: 'root', parentId: 'missing-id' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service } = createHarness();
  assert.equal(service.addBone({ name: 'root' }).ok, true);
  const res = service.updateBone({ name: 'root', parent: 'missing-parent' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const { service, session, calls } = createHarness();
  assert.equal(service.addBone({ name: 'root' }).ok, true);
  assert.equal(service.addBone({ name: 'arm', parent: 'root' }).ok, true);
  assert.equal(service.addBone({ name: 'hand', parent: 'arm' }).ok, true);
  session.addCube({
    id: 'cube1',
    name: 'cube',
    bone: 'hand',
    from: [0, 0, 0],
    to: [1, 1, 1]
  });
  const res = service.deleteBone({ names: ['arm', 'hand'] });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.deleted.length, 2);
    assert.equal(res.value.removedBones, 2);
    assert.equal(res.value.removedCubes, 1);
  }
  assert.equal(calls.deleteBone, 1);
}

{
  const { service, session, calls } = createHarness();
  session.addBone({ name: 'a', parent: 'b', pivot: [0, 0, 0] });
  session.addBone({ name: 'b', parent: 'a', pivot: [0, 0, 0] });
  const res = service.deleteBone({ name: 'a' });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.removedBones, 2);
  assert.equal(calls.deleteBone, 1);
}

{
  const { service, calls } = createHarness({
    deleteBoneError: { code: 'invalid_state', message: 'delete failed' }
  });
  assert.equal(service.addBone({ name: 'root' }).ok, true);
  const res = service.deleteBone({ name: 'root' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
  assert.equal(calls.deleteBone, 1);
}
