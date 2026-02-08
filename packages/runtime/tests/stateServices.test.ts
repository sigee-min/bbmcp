import assert from 'node:assert/strict';

import { diffSnapshots } from '../src/domain/project/diff';
import { resolveFormatId, matchesFormatKind } from '../src/domain/formats';
import { RevisionStore } from '../src/domain/revision/revisionStore';
import { mergeSnapshots } from '../src/domain/project/snapshotMerge';
import { resolveTextureSize } from '../src/domain/textureUtils';
import {
  normalizeCubeFaces,
  resolveCubeTargets,
  summarizeTextureUsage,
  computeUvBounds,
  recommendResolution
} from '../src/usecases/textureService/textureUsageUtils';
import {
  estimateDataUriByteLength,
  normalizeTextureDataUri,
  parseDataUriMimeType
} from '../src/shared/textureData';
import { validateUvBounds } from '../src/domain/uv/bounds';
import { buildUvBoundsMessages } from '../src/shared/messages';
import { resolveAnimationTimePolicy } from '../src/domain/animation/timePolicy';

const uvBoundsMessages = buildUvBoundsMessages();
import type { SessionState } from '../src/session';

const baseSnapshot: SessionState = {
  id: 'p1',
  format: 'Java Block/Item',
  formatId: 'java_block',
  name: 'demo',
  dirty: false,
  bones: [{ name: 'bone', pivot: [0, 0, 0] }],
  cubes: [],
  meshes: [],
  textures: [],
  animations: [],
  animationsStatus: 'available',
  animationTimePolicy: resolveAnimationTimePolicy()
};

const nextSnapshot: SessionState = {
  ...baseSnapshot,
  bones: [{ name: 'bone2', pivot: [0, 0, 0] }],
  cubes: [{ name: 'cube', bone: 'bone2', from: [0, 0, 0], to: [1, 1, 1] }],
  meshes: [
    {
      name: 'wing',
      vertices: [
        { id: 'v0', pos: [0, 0, 0] },
        { id: 'v1', pos: [1, 0, 0] },
        { id: 'v2', pos: [0, 1, 0] }
      ],
      faces: [{ id: 'f0', vertices: ['v0', 'v1', 'v2'] }]
    }
  ],
  textures: [{ name: 'tex', width: 16, height: 16 }],
  animations: [{ name: 'clip', length: 1, loop: true }]
};

const diff = diffSnapshots(baseSnapshot, nextSnapshot, true);
assert.equal(diff.counts.bones.added, 1);
assert.equal(diff.counts.cubes.added, 1);
assert.equal(diff.counts.meshes?.added, 1);
assert.equal(diff.counts.textures.added, 1);
assert.equal(diff.counts.animations.added, 1);
assert.ok(diff.sets);

const store = new RevisionStore(2);
const r1 = store.track(baseSnapshot);
const r2 = store.track(nextSnapshot);
const r3 = store.track({ ...nextSnapshot, name: 'demo2' });
assert.ok(store.get(r1) === null);
assert.ok(store.get(r2));
assert.ok(store.get(r3));

const liveSnapshot: SessionState = {
  ...nextSnapshot,
  name: 'live',
  animationsStatus: 'unavailable'
};
const merged = mergeSnapshots(nextSnapshot, liveSnapshot);
assert.equal(merged.name, 'live');
assert.equal(merged.animations.length, nextSnapshot.animations.length);

const formatId = resolveFormatId(
  'Java Block/Item',
  [
    { id: 'java_block', name: 'Java Block' },
    { id: 'gecko', name: 'GeckoLib' },
    { id: 'free', name: 'Generic Model' },
    { id: 'image', name: 'Image' }
  ],
  { 'Java Block/Item': 'java_block' }
);
assert.equal(formatId, 'java_block');
assert.equal(matchesFormatKind('Java Block/Item', 'java_block'), true);
assert.equal(resolveFormatId('Generic Model', [{ id: 'free', name: 'Generic Model' }]), 'free');
assert.equal(matchesFormatKind('Generic Model', 'free'), true);
assert.equal(resolveFormatId('Image', [{ id: 'image', name: 'Image' }]), 'image');
assert.equal(matchesFormatKind('Image', 'image'), true);

assert.equal(parseDataUriMimeType('data:image/png;base64,AAAA'), 'image/png');
assert.equal(normalizeTextureDataUri('AAAA').startsWith('data:image/png;base64,'), true);
assert.ok(estimateDataUriByteLength('data:image/png;base64,AA==') === 1);

const resolvedSize = resolveTextureSize({ width: 0, height: 0 }, { width: 16, height: 32 });
assert.equal(resolvedSize.width, 16);
assert.equal(resolvedSize.height, 32);

assert.deepEqual(normalizeCubeFaces(['north', 'north', 'south']), ['north', 'south']);
assert.equal(normalizeCubeFaces(['bad' as 'north']), null);

const cubes = [
  { id: 'c1', name: 'cube1', bone: 'bone', from: [0, 0, 0], to: [1, 1, 1] },
  { id: 'c2', name: 'cube2', bone: 'bone', from: [0, 0, 0], to: [1, 1, 1] }
];
assert.equal(resolveCubeTargets(cubes, ['c1'], []).length, 1);
assert.equal(resolveCubeTargets(cubes, [], ['cube2']).length, 1);

const usage = {
  textures: [
    {
      id: 't1',
      name: 'tex',
      cubeCount: 1,
      faceCount: 1,
      cubes: [{ name: 'cube', faces: [{ face: 'north', uv: [0, 0, 8, 8] }] }]
    }
  ],
  unresolved: [{ textureRef: 'missing', cubeName: 'cube', face: 'up' }]
};
const summary = summarizeTextureUsage(usage);
assert.equal(summary.textureCount, 1);
assert.equal(summary.unresolvedCount, 1);

const bounds = computeUvBounds(usage);
assert.ok(bounds);

const recommended = recommendResolution(bounds!, undefined, 64);
assert.ok(recommended);

const uvOk = validateUvBounds([0, 0, 8, 8], { width: 16, height: 16 }, undefined, uvBoundsMessages);
assert.equal(uvOk, null);
const uvNeg = validateUvBounds([-1, 0, 1, 1], { width: 16, height: 16 }, undefined, uvBoundsMessages);
assert.ok(uvNeg && !uvNeg.ok && uvNeg.error.details?.reason === 'negative');
const uvOob = validateUvBounds([0, 0, 32, 32], { width: 16, height: 16 }, undefined, uvBoundsMessages);
assert.ok(uvOob && !uvOob.ok && uvOob.error.details?.reason === 'out_of_bounds');
const uvOrder = validateUvBounds([4, 4, 2, 2], { width: 16, height: 16 }, undefined, uvBoundsMessages);
assert.ok(uvOrder && !uvOrder.ok && uvOrder.error.details?.reason === 'order');



