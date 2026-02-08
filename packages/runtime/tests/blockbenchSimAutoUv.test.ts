import assert from 'node:assert/strict';

import { BlockbenchSim } from './support/sim/BlockbenchSim';

const buildSim = (options?: { singleTexture?: boolean }) =>
  new BlockbenchSim({
    project: {
      format: 'geckolib',
      formatId: 'geckolib',
      textureResolution: { width: 16, height: 16 }
    },
    formatCaps: {
      id: 'sim_format',
      singleTexture: options?.singleTexture ?? false,
      perTextureUvSize: false
    }
  });

{
  const sim = buildSim();
  sim.editor.importTexture({ name: 'tex', width: 16, height: 16 });
  sim.editor.addCube({
    name: 'cube',
    from: [0, 0, 0],
    to: [4, 4, 4],
    boxUv: true
  });
  sim.editor.assignTexture({ textureName: 'tex', cubeNames: ['cube'] });

  const usage = sim.editor.getTextureUsage({}).result;
  assert.ok(usage && usage.textures.length > 0);
  const entry = usage!.textures.find((texture) => texture.name === 'tex');
  assert.ok(entry);
  const cube = entry!.cubes.find((item) => item.name === 'cube');
  assert.ok(cube);

  const uvByFace = new Map(cube!.faces.map((face) => [face.face, face.uv]));
  assert.deepEqual(uvByFace.get('west'), [0, 4, 4, 8]);
  assert.deepEqual(uvByFace.get('north'), [4, 4, 8, 8]);
  assert.deepEqual(uvByFace.get('east'), [8, 4, 12, 8]);
  assert.deepEqual(uvByFace.get('south'), [12, 4, 16, 8]);
  assert.deepEqual(uvByFace.get('up'), [4, 0, 8, 4]);
  assert.deepEqual(uvByFace.get('down'), [8, 0, 12, 4]);
}

{
  const sim = buildSim({ singleTexture: true });
  sim.editor.importTexture({ id: 'tex-1', name: 'old', width: 16, height: 16 });
  sim.editor.addCube({ name: 'cube', from: [0, 0, 0], to: [4, 4, 4] });
  sim.editor.assignTexture({ textureName: 'old', cubeNames: ['cube'] });
  sim.editor.importTexture({ id: 'tex-2', name: 'new', width: 16, height: 16 });

  const usage = sim.editor.getTextureUsage({}).result;
  assert.ok(usage);
  assert.equal(usage!.unresolved?.length ?? 0, 0);
  const entry = usage!.textures.find((texture) => texture.name === 'new');
  assert.ok(entry);
  assert.equal(entry!.cubeCount, 1);
  assert.equal(entry!.faceCount, 6);
}

{
  const sim = buildSim();
  sim.loadProject({
    textures: [{ id: 'tex-1', name: 'old', width: 16, height: 16 }],
    cubes: [
      {
        id: 'cube-1',
        name: 'cube',
        from: [0, 0, 0],
        to: [4, 4, 4],
        faces: { north: { texture: 'old' } }
      }
    ]
  });
  sim.editor.updateTexture({ name: 'old', newName: 'new', width: 16, height: 16 });

  const usage = sim.editor.getTextureUsage({}).result;
  assert.ok(usage);
  assert.equal(usage!.unresolved?.length ?? 0, 0);
  const entry = usage!.textures.find((texture) => texture.name === 'new');
  assert.ok(entry);
  assert.equal(entry!.cubeCount, 1);
}
