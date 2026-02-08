const assert = require('node:assert/strict');

const { buildUvAtlasPlan } = require('../src/domain/uv/atlas');
const { DEFAULT_UV_POLICY } = require('../src/domain/uv/policy');
const { buildUvAtlasMessages } = require('../src/shared/messages');

const uvAtlasMessages = buildUvAtlasMessages();

const buildUsage = (textureName, cubes) => ({
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

const cubeHuge = {
  id: 'cube-huge',
  name: 'cube-huge',
  from: [0, 0, 0],
  to: [2048, 2048, 1],
  bone: 'root'
};

const usageHuge = buildUsage('tex-huge', [cubeHuge]);
const planHuge = buildUvAtlasPlan({
  usage: usageHuge,
  cubes: [cubeHuge],
  resolution: { width: 16, height: 16 },
  maxResolution: { width: 64, height: 64 },
  padding: 0,
  policy: DEFAULT_UV_POLICY,
  messages: uvAtlasMessages
});

assert.equal(planHuge.ok, false);
if (!planHuge.ok) {
  assert.equal(planHuge.error.details?.reason, 'uv_size_exceeds');
}
