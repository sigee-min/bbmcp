import assert from 'node:assert/strict';

import { MAX_TEXTURE_OPS } from '../../src/domain/textureOps';
import { renderTextureSpec, resolveTextureBase } from '../../src/proxy/texture';
import { asDomPort, createMockDom, DEFAULT_LIMITS, registerAsync, unsafePayload } from './helpers';

const limits = DEFAULT_LIMITS;

// Invalid dimensions -> invalid_payload
{
  const dom = asDomPort(createMockDom());
  const res = renderTextureSpec(dom, { name: 't', width: 0, height: 16, ops: [] }, limits);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Too many ops -> invalid_payload
{
  const dom = asDomPort(createMockDom());
  const ops = new Array(MAX_TEXTURE_OPS + 1).fill({ op: 'set_pixel', x: 0, y: 0, color: '#000' });
  const res = renderTextureSpec(dom, { name: 't', width: 16, height: 16, ops }, limits);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Unsupported op -> invalid_payload
{
  const dom = asDomPort(createMockDom());
  const res = renderTextureSpec(
    dom,
    { name: 't', width: 16, height: 16, ops: [unsafePayload({ op: 'nope' })] },
    limits
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Success path: apply supported ops
{
  const dom = asDomPort(createMockDom());
  const res = renderTextureSpec(
    dom,
    {
      name: 't',
      width: 16,
      height: 16,
      background: '#ffffff',
      ops: [
        { op: 'set_pixel', x: 1, y: 1, color: '#ff00ff' },
        { op: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: '#000000' },
        { op: 'draw_rect', x: 0, y: 0, width: 3, height: 3, color: '#000000', lineWidth: 2 },
        { op: 'draw_line', x1: 0, y1: 0, x2: 4, y2: 4, color: '#000000' }
      ]
    },
    limits,
    { image: unsafePayload({}), width: 16, height: 16 }
  );

  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.width, 16);
    assert.equal(res.data.height, 16);
    assert.ok(res.data.coverage);
    assert.equal(typeof res.data.coverage?.opaqueRatio, 'number');
  }
}

// uvPaint requires rects
{
  const dom = asDomPort(createMockDom());
  const res = renderTextureSpec(
    dom,
    { name: 't', width: 16, height: 16, ops: [] },
    limits,
    undefined,
    { rects: [], mapping: 'stretch', padding: 0, anchor: [0, 0], source: { width: 16, height: 16 } }
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// uvPaint tile mapping: pattern unavailable
{
  const dom = asDomPort(createMockDom({ pattern: null }));
  const res = renderTextureSpec(
    dom,
    { name: 't', width: 16, height: 16, ops: [] },
    limits,
    undefined,
    {
      rects: [{ x1: 0, y1: 0, x2: 8, y2: 8 }],
      mapping: 'tile',
      padding: 0,
      anchor: [0, 0],
      source: { width: 8, height: 8 }
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'not_implemented');
  }
}

// uvPaint tile mapping: success + paintCoverage
{
  const dom = asDomPort(createMockDom({ pattern: {} }));
  const res = renderTextureSpec(
    dom,
    { name: 't', width: 16, height: 16, background: '#ffffff', ops: [] },
    limits,
    undefined,
    {
      rects: [{ x1: 0, y1: 0, x2: 8, y2: 8 }],
      mapping: 'tile',
      padding: 0,
      anchor: [0, 0],
      source: { width: 8, height: 8 }
    }
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.ok(res.data.paintCoverage);
    assert.equal(typeof res.data.paintCoverage?.opaquePixels, 'number');
  }
}

// Async tests: register promises with runner.
registerAsync(
  (async () => {
    const dom = asDomPort(createMockDom());
    const res = await resolveTextureBase(dom, { name: 't' });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'not_implemented');
    }
  })()
);

registerAsync(
  (async () => {
    const dom = asDomPort(createMockDom());
    const res = await resolveTextureBase(dom, {
      name: 't',
      image: unsafePayload({ width: 8, height: 8 }),
      width: 8,
      height: 8
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.width, 8);
      assert.equal(res.data.height, 8);
    }
  })()
);

registerAsync(
  (async () => {
    const dom = asDomPort(createMockDom());
    const res = await resolveTextureBase(dom, { name: 't', image: unsafePayload({ width: 0, height: 0 }) });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'invalid_payload');
    }
  })()
);
