import assert from 'node:assert/strict';

import {
  countChangedPixels,
  countOpaquePixels,
  doesBoundsIntersectCanvas,
  doesBoundsIntersectRects,
  getRectSpan,
  getTextureOpBounds,
  isSuspiciousOpaqueDrop,
  mergeRects,
  overlayPatchRects,
  overlayTextureSpaceRects
} from '../src/usecases/textureTools/paintFacesPixels';

{
  assert.equal(mergeRects([]), null);
  assert.deepEqual(
    mergeRects([
      { x1: 2, y1: 3, x2: 6, y2: 8 },
      { x1: 0, y1: 4, x2: 9, y2: 5 }
    ]),
    { x1: 0, y1: 3, x2: 9, y2: 8 }
  );
}

{
  assert.equal(getRectSpan(2, 2), 1);
  assert.equal(getRectSpan(2, 7), 5);
}

{
  const bounds = getTextureOpBounds({ op: 'fill_rect', x: 1, y: 2, width: 3, height: 4, color: '#112233' });
  assert.deepEqual(bounds, { x1: 1, y1: 2, x2: 4, y2: 6 });
  assert.equal(doesBoundsIntersectCanvas(bounds, 8, 8), true);
  assert.equal(doesBoundsIntersectCanvas(bounds, 1, 1), false);
  assert.equal(doesBoundsIntersectRects(bounds, [{ x1: 3, y1: 3, x2: 5, y2: 5 }]), true);
  assert.equal(doesBoundsIntersectRects(bounds, [{ x1: 10, y1: 10, x2: 12, y2: 12 }]), false);
}

{
  const width = 4;
  const height = 4;
  const target = new Uint8ClampedArray(width * height * 4);
  const patch = new Uint8ClampedArray(width * height * 4);
  const tex = new Uint8ClampedArray(width * height * 4);
  const targetIdx = (1 * width + 1) * 4;
  const patchIdx = (1 * width + 1) * 4;
  const texIdx = (2 * width + 2) * 4;
  patch[patchIdx] = 12;
  patch[patchIdx + 1] = 34;
  tex[texIdx] = 56;
  tex[texIdx + 1] = 78;
  overlayPatchRects(target, patch, [{ x1: 1, y1: 1, x2: 2, y2: 2 }], width, height);
  assert.equal(target[targetIdx], 12);
  assert.equal(target[targetIdx + 1], 34);
  overlayTextureSpaceRects(target, tex, [{ x1: 2, y1: 2, x2: 3, y2: 3 }], width, height);
  assert.equal(target[texIdx], 56);
  assert.equal(target[texIdx + 1], 78);
}

{
  const a = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
  const b = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 9]);
  const c = new Uint8ClampedArray([1, 2, 3, 4]);
  assert.equal(countChangedPixels(a, b), 1);
  assert.equal(countChangedPixels(a, c), 0);
}

{
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 0,
    0, 0, 0, 8,
    0, 0, 0, 9
  ]);
  assert.equal(countOpaquePixels(pixels), 1);
  assert.equal(isSuspiciousOpaqueDrop(255, 10), false);
  assert.equal(isSuspiciousOpaqueDrop(300, 280), false);
  assert.equal(isSuspiciousOpaqueDrop(300, 5), true);
}
