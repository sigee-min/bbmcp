import assert from 'node:assert/strict';
import { buildUvAtlasPlan } from '../src/domain/uv/atlas';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { TextureUsageResult } from '../src/ports/editor';
import { TrackedCube } from '../src/session';
import { buildUvAtlasMessages } from '../src/shared/messages';

const uvAtlasMessages = buildUvAtlasMessages();

const buildUsage = (textureName: string, cubes: TrackedCube[]): TextureUsageResult => ({
  textures: [
    {
      id: `${textureName}-id`,
      name: textureName,
      cubeCount: cubes.length,
      faceCount: cubes.length,
      cubes: cubes.map((cube) => ({
        id: cube.id,
        name: cube.name,
        faces: [{ face: 'north' }]
      }))
    }
  ]
});

const runPlan = (usage: TextureUsageResult, cubes: TrackedCube[], resolution: number) =>
  buildUvAtlasPlan({
    usage,
    cubes,
    resolution: { width: resolution, height: resolution },
    maxResolution: { width: 64, height: 64 },
    padding: 0,
    policy: DEFAULT_UV_POLICY,
    messages: uvAtlasMessages
  });

const cubeSmall: TrackedCube = {
  id: 'cube-small',
  name: 'cube-small',
  from: [0, 0, 0],
  to: [8, 8, 1],
  bone: 'root'
};

const usageSmall = buildUsage('tex-small', [cubeSmall]);
const planSmall = runPlan(usageSmall, [cubeSmall], 16);
assert.equal(planSmall.ok, true);
if (planSmall.ok) {
  assert.equal(planSmall.data.steps, 0);
  assert.deepEqual(planSmall.data.resolution, { width: 16, height: 16 });
  assert.equal(planSmall.data.assignments.length, 1);
}

const cubeMedium: TrackedCube = {
  id: 'cube-medium',
  name: 'cube-medium',
  from: [0, 0, 0],
  to: [12, 12, 1],
  bone: 'root'
};

const usagePacked = buildUsage('tex-packed', [cubeMedium, cubeSmall]);
const planPacked = buildUvAtlasPlan({
  usage: usagePacked,
  cubes: [cubeMedium, cubeSmall],
  resolution: { width: 16, height: 16 },
  maxResolution: { width: 32, height: 32 },
  padding: 0,
  policy: DEFAULT_UV_POLICY,
  messages: uvAtlasMessages
});
assert.equal(planPacked.ok, true);
if (planPacked.ok) {
  assert.equal(planPacked.data.steps, 1);
  assert.deepEqual(planPacked.data.resolution, { width: 32, height: 32 });
  assert.equal(planPacked.data.assignments.length, 2);
}


