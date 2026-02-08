import assert from 'node:assert/strict';

import type { SessionState } from '../src/session';
import { ensureRootBone, walkNodes } from '../src/adapters/blockbench/snapshot/nodes';

const createStateBuffers = () => {
  const bones: SessionState['bones'] = [];
  const cubes: SessionState['cubes'] = [];
  const meshes: SessionState['meshes'] = [];
  return { bones, cubes, meshes };
};

{
  const { bones, cubes, meshes } = createStateBuffers();
  walkNodes(
    [
      {
        name: 'ambiguous',
        children: [],
        from: [0, 0, 0],
        to: [1, 1, 1]
      } as unknown as Parameters<typeof walkNodes>[0][number]
    ],
    undefined,
    bones,
    cubes,
    meshes,
    {} as Parameters<typeof walkNodes>[5]
  );
  assert.equal(bones.length, 0);
  assert.equal(cubes.length, 1);
  assert.equal(cubes[0]?.name, 'ambiguous');
}

{
  const { bones, cubes, meshes } = createStateBuffers();
  walkNodes(
    [
      {
        name: 'body',
        children: [{ name: 'body_main', from: [0, 0, 0], to: [2, 2, 2] }]
      } as unknown as Parameters<typeof walkNodes>[0][number]
    ],
    undefined,
    bones,
    cubes,
    meshes,
    {} as Parameters<typeof walkNodes>[5]
  );
  assert.equal(bones.length, 1);
  assert.equal(cubes.length, 1);
  assert.equal(bones[0]?.name, 'body');
  assert.equal(cubes[0]?.bone, 'body');
}

{
  const { bones, cubes, meshes } = createStateBuffers();
  walkNodes(
    [
      {
        name: 'body',
        children: [
          {
            name: 'body_main',
            from: { x: -1, y: 0, z: -1 },
            to: { x: 1, y: 2, z: 1 },
            uv_offset: { x: 3, y: 4 }
          }
        ]
      } as unknown as Parameters<typeof walkNodes>[0][number]
    ],
    undefined,
    bones,
    cubes,
    meshes,
    {} as Parameters<typeof walkNodes>[5]
  );
  assert.equal(cubes[0]?.from?.[0], -1);
  assert.equal(cubes[0]?.uvOffset?.[0], 3);
  assert.equal(cubes[0]?.uvOffset?.[1], 4);
}

{
  const bones: SessionState['bones'] = [{ name: 'body', pivot: [0, 0, 0] }];
  const cubes: SessionState['cubes'] = [
    { name: 'body_main', bone: 'root', from: [0, 0, 0], to: [1, 1, 1] }
  ];
  ensureRootBone(bones, cubes);
  assert.equal(bones[0]?.name, 'root');
}

{
  const bones: SessionState['bones'] = [{ name: 'root', pivot: [0, 0, 0] }];
  const cubes: SessionState['cubes'] = [
    { name: 'body_main', bone: 'root', from: [0, 0, 0], to: [1, 1, 1] }
  ];
  ensureRootBone(bones, cubes);
  assert.equal(bones.length, 1);
}
