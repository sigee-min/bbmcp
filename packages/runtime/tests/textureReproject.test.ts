import assert from 'node:assert/strict';

import { reprojectTexturePixels } from '../src/domain/textureReproject';

const createOpaque = (width: number, height: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return data;
};

const countOpaque = (data: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count += 1;
  }
  return count;
};

// Fractional rects should not collapse to empty mappings.
{
  const out = reprojectTexturePixels({
    source: createOpaque(4, 4),
    sourceWidth: 4,
    sourceHeight: 4,
    destWidth: 4,
    destHeight: 4,
    mappings: [{ from: [0.2, 0.2, 0.8, 0.8], to: [1.2, 1.2, 1.8, 1.8] }]
  });
  assert.equal(countOpaque(out) > 0, true);
}

// Degenerate zero-area rects should still be rejected.
{
  const out = reprojectTexturePixels({
    source: createOpaque(4, 4),
    sourceWidth: 4,
    sourceHeight: 4,
    destWidth: 4,
    destHeight: 4,
    mappings: [{ from: [1, 1, 1, 2], to: [1, 1, 2, 2] }]
  });
  assert.equal(countOpaque(out), 0);
}

