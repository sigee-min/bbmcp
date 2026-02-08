import assert from 'node:assert/strict';

import { toToolResponse } from '../src/shared/tooling/toolResponse';

{
  const res = toToolResponse({ ok: true, value: { a: 1 } });
  assert.deepEqual(res, { ok: true, data: { a: 1 } });
}

{
  const res = toToolResponse({ ok: false, error: { code: 'invalid_payload', message: 'bad' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, 'bad.');
  }
}


