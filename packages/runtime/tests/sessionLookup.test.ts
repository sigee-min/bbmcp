import assert from 'node:assert/strict';

import {
  collectDescendantBones,
  isDescendantBone,
  resolveBoneNameById,
  resolveTargetByIdOrName,
  resolveTargetLabel
} from '../src/domain/sessionLookup';

{
  const bones = [
    { id: 'b1', name: 'root', pivot: [0, 0, 0] as [number, number, number] },
    { id: 'b2', name: 'arm', parent: 'root', pivot: [0, 0, 0] as [number, number, number] },
    { id: 'b3', name: 'hand', parent: 'arm', pivot: [0, 0, 0] as [number, number, number] }
  ];
  assert.equal(resolveBoneNameById(bones, 'b2'), 'arm');
  assert.equal(resolveBoneNameById(bones, 'missing'), null);
  assert.deepEqual(collectDescendantBones(bones, 'root'), ['arm', 'hand']);
  assert.equal(isDescendantBone(bones, 'root', 'hand'), true);
  assert.equal(isDescendantBone(bones, 'arm', 'root'), false);
}

{
  const bones = [
    { name: 'a', parent: 'b', pivot: [0, 0, 0] as [number, number, number] },
    { name: 'b', parent: 'a', pivot: [0, 0, 0] as [number, number, number] }
  ];
  const descendants = collectDescendantBones(bones, 'a');
  assert.deepEqual(descendants.sort(), ['a', 'b']);
}

{
  const items = [
    { id: '1', name: 'first' },
    { id: '2', name: 'second' }
  ];
  assert.equal(resolveTargetByIdOrName(items, '2', undefined)?.name, 'second');
  assert.equal(resolveTargetByIdOrName(items, undefined, 'first')?.id, '1');
  assert.equal(resolveTargetByIdOrName(items, undefined, undefined), null);
  assert.equal(resolveTargetLabel('id', 'name'), 'id');
  assert.equal(resolveTargetLabel(undefined, 'name'), 'name');
  assert.equal(resolveTargetLabel(undefined, undefined), 'unknown');
}
