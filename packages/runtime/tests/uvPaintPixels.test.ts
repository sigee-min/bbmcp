import assert from 'node:assert/strict';
import { applyUvPaintPixels } from '../src/domain/uv/paintPixels';
import { buildUvPaintPixelMessages } from '../src/shared/messages';

const messages = buildUvPaintPixelMessages();

const source = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255])
};

const result = applyUvPaintPixels({
  source,
  target: { width: 4, height: 4 },
  config: {
    rects: [{ x1: 1, y1: 1, x2: 3, y2: 3 }],
    mapping: 'stretch',
    padding: 0,
    anchor: [0, 0]
  },
  label: 'test',
  messages
});

assert.equal(result.ok, true);
if (result.ok) {
  const { data } = result.data;
  const idx = (x: number, y: number, width: number) => (y * width + x) * 4;
  const inside = idx(1, 1, 4);
  const outside = idx(0, 0, 4);
  assert.equal(data[inside], 255);
  assert.equal(data[inside + 1], 0);
  assert.equal(data[inside + 2], 0);
  assert.equal(data[inside + 3], 255);
  assert.equal(data[outside + 3], 0);
}


