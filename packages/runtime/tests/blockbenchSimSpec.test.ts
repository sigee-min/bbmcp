import assert from 'node:assert/strict';

import { BlockbenchSim } from './support/sim/BlockbenchSim';

const sim = new BlockbenchSim({
  project: {
    format: 'geckolib',
    formatId: 'geckolib',
    textureResolution: { width: 16, height: 16 }
  },
  formatCaps: {
    id: 'sim_format',
    singleTexture: true,
    perTextureUvSize: false
  }
});

sim.editor.importTexture({ name: 'first', width: 32, height: 32 });
sim.editor.importTexture({ name: 'second', width: 64, height: 64 });

const textures = sim.editor.listTextures();
assert.equal(textures.length, 1);
assert.equal(textures[0].name, 'second');
assert.equal(textures[0].width, 64);
assert.equal(textures[0].height, 64);

const resolution = sim.editor.getProjectTextureResolution();
assert.deepEqual(resolution, { width: 64, height: 64 });

sim.editor.updateTexture({ name: 'second', width: 128, height: 128 });
const updated = sim.editor.listTextures();
assert.equal(updated[0].width, 128);
assert.equal(updated[0].height, 128);
assert.deepEqual(sim.editor.getProjectTextureResolution(), { width: 128, height: 128 });

