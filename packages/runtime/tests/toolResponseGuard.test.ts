import assert from 'node:assert/strict';

import { normalizeToolResponseShape } from '../src/shared/tooling/toolResponseGuard';

// ok path should pass through data.
{
  const res = normalizeToolResponseShape({ ok: true, data: { a: 1 } });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.data, { a: 1 });
  }
}

// malformed response should produce error.
{
  const res = normalizeToolResponseShape({ nope: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unknown');
  }
}


