import assert from 'node:assert/strict';

import type { Limits, TextureUsage } from '../src/domain/model';
import { resolveUvPaintRects } from '../src/domain/uv/paint';
import { applyUvPaintPixels } from '../src/domain/uv/paintPixels';
import { validateUvPaintSpec } from '../src/domain/uv/paintValidation';
import { buildUvPaintMessages, buildUvPaintPixelMessages } from '../src/shared/messages';

const limits: Limits = {
  maxCubes: 512,
  maxTextureSize: 128,
  maxAnimationSeconds: 120
};

const paintMessages = buildUvPaintMessages();
const pixelMessages = buildUvPaintPixelMessages();

const rgba = (width: number, height: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const base = i * 4;
    out[base] = 32 + (i % 16);
    out[base + 1] = 64 + ((i * 3) % 16);
    out[base + 2] = 96 + ((i * 7) % 16);
    out[base + 3] = 255;
  }
  return out;
};

const countOpaque = (data: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count += 1;
  }
  return count;
};

{
  const valid = validateUvPaintSpec(
    {
      scope: 'rects',
      mapping: 'tile',
      padding: 0,
      anchor: [0, 0],
      source: { width: 8, height: 8 },
      target: { cubeNames: ['body'], faces: ['north'] }
    },
    limits,
    'uvPaint',
    paintMessages
  );
  assert.equal(valid.ok, true);
}

{
  const invalidAnchor = validateUvPaintSpec(
    { anchor: [0, 'x'] },
    limits,
    'uvPaint',
    paintMessages
  );
  assert.equal(invalidAnchor.ok, false);
  if (!invalidAnchor.ok) assert.equal(invalidAnchor.error.code, 'invalid_payload');

  const invalidSource = validateUvPaintSpec(
    { source: { width: 1024, height: 1 } },
    limits,
    'uvPaint',
    paintMessages
  );
  assert.equal(invalidSource.ok, false);
  if (!invalidSource.ok) assert.equal(invalidSource.error.code, 'invalid_payload');
}

{
  const usage: TextureUsage = {
    textures: [
      {
        id: 't1',
        name: 'atlas',
        cubeCount: 2,
        faceCount: 3,
        cubes: [
          {
            id: 'c1',
            name: 'body',
            faces: [
              { face: 'north', uv: [0, 0, 4, 4] },
              { face: 'south', uv: [0, 0, 4, 4] }
            ]
          },
          {
            id: 'c2',
            name: 'head',
            faces: [{ face: 'north', uv: [4, 4, 8, 8] }]
          }
        ]
      }
    ]
  };

  const rects = resolveUvPaintRects(
    {
      name: 'atlas',
      uvPaint: { scope: 'rects', target: { cubeNames: ['body'], faces: ['north', 'south'] } }
    },
    usage,
    paintMessages
  );
  assert.equal(rects.ok, true);
  if (rects.ok) assert.equal(rects.data.rects.length, 1);

  const bounds = resolveUvPaintRects(
    {
      name: 'atlas',
      uvPaint: { scope: 'bounds', target: { cubeNames: ['body', 'head'], faces: ['north', 'south'] } }
    },
    usage,
    paintMessages
  );
  assert.equal(bounds.ok, true);
  if (bounds.ok) assert.deepEqual(bounds.data.rects[0], { x1: 0, y1: 0, x2: 8, y2: 8 });

  const missingFace = resolveUvPaintRects(
    {
      name: 'atlas',
      uvPaint: { scope: 'faces', target: { cubeNames: ['body'], faces: ['east'] } }
    },
    usage,
    paintMessages
  );
  assert.equal(missingFace.ok, false);
  if (!missingFace.ok) assert.equal(missingFace.error.details?.reason, 'target_faces_not_found');

  const missingCube = resolveUvPaintRects(
    {
      name: 'atlas',
      uvPaint: { scope: 'faces', target: { cubeNames: ['missing'] } }
    },
    usage,
    paintMessages
  );
  assert.equal(missingCube.ok, false);
  if (!missingCube.ok) assert.equal(missingCube.error.details?.reason, 'target_cubes_not_found');
}

{
  const noUsage = resolveUvPaintRects(
    { name: 'missing', uvPaint: { scope: 'rects' } },
    { textures: [] },
    paintMessages
  );
  assert.equal(noUsage.ok, false);
  if (!noUsage.ok) assert.equal(noUsage.error.details?.reason, 'usage_missing');
}

{
  const invalidData = applyUvPaintPixels({
    source: { width: 2, height: 2, data: new Uint8ClampedArray(3) },
    target: { width: 4, height: 4 },
    config: {
      rects: [{ x1: 0, y1: 0, x2: 4, y2: 4 }],
      mapping: 'stretch',
      padding: 0,
      anchor: [0, 0]
    },
    label: 'paint',
    messages: pixelMessages
  });
  assert.equal(invalidData.ok, false);
  if (!invalidData.ok) assert.equal(invalidData.error.code, 'invalid_payload');
}

{
  for (let i = 0; i < 24; i += 1) {
    const sourceWidth = 1 + (i % 3);
    const sourceHeight = 1 + ((i * 7) % 3);
    const targetWidth = 6 + (i % 5);
    const targetHeight = 6 + ((i * 3) % 5);
    const x1 = i % (targetWidth - 1);
    const y1 = (i * 2) % (targetHeight - 1);
    const x2 = x1 + 1 + ((i * 5) % (targetWidth - x1));
    const y2 = y1 + 1 + ((i * 11) % (targetHeight - y1));
    const source = { width: sourceWidth, height: sourceHeight, data: rgba(sourceWidth, sourceHeight) };

    const stretch = applyUvPaintPixels({
      source,
      target: { width: targetWidth, height: targetHeight },
      config: { rects: [{ x1, y1, x2, y2 }], mapping: 'stretch', padding: 0, anchor: [0, 0] },
      label: 'stretch',
      messages: pixelMessages
    });
    assert.equal(stretch.ok, true);
    if (stretch.ok) {
      assert.equal(stretch.data.data.length, targetWidth * targetHeight * 4);
      assert.equal(countOpaque(stretch.data.data) > 0, true);
    }

    const tile = applyUvPaintPixels({
      source,
      target: { width: targetWidth, height: targetHeight },
      config: { rects: [{ x1, y1, x2, y2 }], mapping: 'tile', padding: 0, anchor: [-3, 2] },
      label: 'tile',
      messages: pixelMessages
    });
    assert.equal(tile.ok, true);
    if (tile.ok) {
      assert.equal(tile.data.data.length, targetWidth * targetHeight * 4);
      assert.equal(countOpaque(tile.data.data) > 0, true);
    }
  }
}

