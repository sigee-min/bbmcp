import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  applyHslComplement,
  applyRgbInvert,
  COLOR_TRANSFORM_FORMULA,
  createColorTransformer,
  transformPngFile,
  transformRgbaBuffer
} from '../brandColorTransform.mjs';

const assertRgbApprox = (actual, expected, tolerance = 1) => {
  assert.ok(Math.abs(actual.r - expected.r) <= tolerance, `r mismatch: ${actual.r} vs ${expected.r}`);
  assert.ok(Math.abs(actual.g - expected.g) <= tolerance, `g mismatch: ${actual.g} vs ${expected.g}`);
  assert.ok(Math.abs(actual.b - expected.b) <= tolerance, `b mismatch: ${actual.b} vs ${expected.b}`);
};

test('hsl complement formula maps primary colors to complements', () => {
  assertRgbApprox(applyHslComplement({ r: 255, g: 0, b: 0 }), { r: 0, g: 255, b: 255 });
  assertRgbApprox(applyHslComplement({ r: 0, g: 0, b: 255 }), { r: 255, g: 255, b: 0 });
  assertRgbApprox(applyHslComplement({ r: 127, g: 127, b: 127 }), { r: 127, g: 127, b: 127 });
});

test('hsl complement can invert lightness for dark variant contrast', () => {
  assertRgbApprox(applyHslComplement({ r: 255, g: 255, b: 255 }, { invertLightness: true }), { r: 0, g: 0, b: 0 });
  assertRgbApprox(applyHslComplement({ r: 32, g: 32, b: 32 }, { invertLightness: true }), { r: 223, g: 223, b: 223 });
});

test('rgb invert formula follows 255 - channel rule', () => {
  assert.deepEqual(applyRgbInvert({ r: 10, g: 20, b: 30 }), { r: 245, g: 235, b: 225 });
});

test('transformRgbaBuffer applies transformer while preserving alpha', () => {
  const source = Buffer.from([255, 0, 0, 255, 10, 20, 30, 0]);
  const transformed = transformRgbaBuffer(source, createColorTransformer(COLOR_TRANSFORM_FORMULA.HSL_COMPLEMENT));
  assert.equal(transformed[3], 255);
  assert.equal(transformed[7], 0);
  assertRgbApprox({ r: transformed[0], g: transformed[1], b: transformed[2] }, { r: 0, g: 255, b: 255 });
  assert.equal(transformed[4], 10);
  assert.equal(transformed[5], 20);
  assert.equal(transformed[6], 30);
});

test('transformPngFile writes transformed png output', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ashfox-color-transform-test-'));
  try {
    const inputPath = path.join(tempDir, 'source.png');
    const outputPath = path.join(tempDir, 'result.png');
    const image = new PNG({ width: 1, height: 1 });
    image.data[0] = 255;
    image.data[1] = 0;
    image.data[2] = 0;
    image.data[3] = 255;
    writeFileSync(inputPath, PNG.sync.write(image));

    transformPngFile({ inputPath, outputPath, formula: COLOR_TRANSFORM_FORMULA.HSL_COMPLEMENT });

    const output = PNG.sync.read(readFileSync(outputPath));
    assertRgbApprox(
      { r: output.data[0], g: output.data[1], b: output.data[2] },
      { r: 0, g: 255, b: 255 }
    );
    assert.equal(output.data[3], 255);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
