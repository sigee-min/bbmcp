import assert from 'node:assert/strict';

import { applyShadedFillRect, resolveFillRectShade } from '../src/domain/textureFillShade';

const pixelLuma = (data: Uint8ClampedArray, width: number, x: number, y: number): number => {
  const idx = (y * width + x) * 4;
  return data[idx] + data[idx + 1] + data[idx + 2];
};

{
  const shade = resolveFillRectShade(false, 0, 0, 4, 4, { r: 64, g: 96, b: 128, a: 255 });
  assert.equal(shade, null);
}

{
  const shade = resolveFillRectShade(undefined, 0, 0, 4, 4, { r: 64, g: 96, b: 128, a: 255 });
  assert.ok(shade);
  if (shade) {
    assert.equal(shade.lightDir, 'tl_br');
    assert.ok(shade.intensity > 0 && shade.intensity <= 1);
    assert.ok(shade.edge >= 0 && shade.edge <= 1);
    assert.ok(shade.noise >= 0 && shade.noise <= 1);
  }
}

{
  const color = { r: 100, g: 120, b: 80, a: 255 };
  const width = 4;
  const height = 4;
  const first = new Uint8ClampedArray(width * height * 4);
  const second = new Uint8ClampedArray(width * height * 4);
  const shade = resolveFillRectShade(
    { intensity: 0.4, edge: 0.0, noise: 0.0, seed: 7, lightDir: 'tl_br' },
    0,
    0,
    width,
    height,
    color
  );
  assert.ok(shade);
  applyShadedFillRect(first, width, 0, 0, width, height, color, shade!);
  applyShadedFillRect(second, width, 0, 0, width, height, color, shade!);
  assert.deepEqual(first, second);
  assert.ok(pixelLuma(first, width, 0, 0) > pixelLuma(first, width, 3, 3));
}

{
  const color = { r: 100, g: 100, b: 100, a: 255 };
  const width = 4;
  const height = 4;

  const topBottom = resolveFillRectShade(
    { intensity: 0.35, edge: 0, noise: 0, seed: 1, lightDir: 'top_bottom' },
    0,
    0,
    width,
    height,
    color
  )!;
  const topBottomPixels = new Uint8ClampedArray(width * height * 4);
  applyShadedFillRect(topBottomPixels, width, 0, 0, width, height, color, topBottom);
  assert.ok(pixelLuma(topBottomPixels, width, 1, 0) > pixelLuma(topBottomPixels, width, 1, 3));

  const leftRight = resolveFillRectShade(
    { intensity: 0.35, edge: 0, noise: 0, seed: 1, lightDir: 'left_right' },
    0,
    0,
    width,
    height,
    color
  )!;
  const leftRightPixels = new Uint8ClampedArray(width * height * 4);
  applyShadedFillRect(leftRightPixels, width, 0, 0, width, height, color, leftRight);
  assert.ok(pixelLuma(leftRightPixels, width, 0, 1) > pixelLuma(leftRightPixels, width, 3, 1));

  const trBl = resolveFillRectShade(
    { intensity: 0.35, edge: 0, noise: 0, seed: 1, lightDir: 'tr_bl' },
    0,
    0,
    width,
    height,
    color
  )!;
  const trBlPixels = new Uint8ClampedArray(width * height * 4);
  applyShadedFillRect(trBlPixels, width, 0, 0, width, height, color, trBl);
  assert.ok(pixelLuma(trBlPixels, width, 3, 0) > pixelLuma(trBlPixels, width, 0, 3));
}
