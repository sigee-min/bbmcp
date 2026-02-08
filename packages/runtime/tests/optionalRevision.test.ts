import assert from 'node:assert/strict';

import { guardOptionalRevision } from '../src/shared/tooling/optionalRevision';

{
  const service = {
    ensureRevisionMatchIfProvided: () => null
  };
  assert.equal(guardOptionalRevision(service as never, undefined), null);
  assert.equal(guardOptionalRevision(service as never, {}), null);
  assert.equal(guardOptionalRevision(service as never, { ifRevision: '' }), null);
}

{
  const service = {
    ensureRevisionMatchIfProvided: (revision: string) => {
      assert.equal(revision, 'r1');
      return null;
    }
  };
  assert.equal(guardOptionalRevision(service as never, { ifRevision: 'r1' }), null);
}

{
  const service = {
    ensureRevisionMatchIfProvided: () => ({
      code: 'invalid_state',
      message: 'revision mismatch',
      details: {}
    })
  };
  const result = guardOptionalRevision(service as never, { ifRevision: 'r1' });
  assert.equal(result?.ok, false);
  if (result && !result.ok) {
    assert.equal(result.error.code, 'invalid_state');
    assert.equal(result.error.details?.reason, 'invalid_state');
  }
}
