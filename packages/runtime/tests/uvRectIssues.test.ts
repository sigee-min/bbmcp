import assert from 'node:assert/strict';

import { computeUvRectIssues, formatRectExample } from '../src/domain/uv/issues';

const usage = {
  textures: [
    {
      id: 'tex1',
      name: 'atlas',
      cubeCount: 1,
      faceCount: 2,
      cubes: [
        {
          id: 'cube1',
          name: 'base',
          faces: [
            { face: 'north', uv: [0, 0, 3, 1] },
            { face: 'south', uv: [0, 0, 3, 3] }
          ]
        }
      ]
    }
  ]
};

const issues = computeUvRectIssues(usage, { minArea: 9, maxAspect: 3 });
assert.equal(issues.small.length, 1);
assert.equal(issues.small[0].textureName, 'atlas');
assert.equal(issues.small[0].count, 2);

assert.equal(issues.skewed.length, 1);
assert.equal(issues.skewed[0].textureName, 'atlas');
assert.equal(issues.skewed[0].count, 1);

const example = formatRectExample(issues.skewed[0].example);
assert.ok(example.includes('base'));
assert.ok(example.includes('3x1'));
