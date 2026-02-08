import assert from 'node:assert/strict';

import { ensureIdNameMatch, ensureIdOrName, ensureNonBlankString } from '../src/domain/payloadValidation';

{
  const error = ensureNonBlankString('   ', { message: 'name required', fix: 'set name' });
  assert.deepEqual(error, { code: 'invalid_payload', message: 'name required', fix: 'set name' });
}

{
  const error = ensureNonBlankString('ok', { message: 'name required' });
  assert.equal(error, null);
}

{
  const error = ensureNonBlankString(undefined, { message: 'name required' });
  assert.equal(error, null);
}

{
  const error = ensureIdOrName(undefined, undefined, { message: 'id or name required' });
  assert.equal(error?.code, 'invalid_payload');
}

{
  const error = ensureIdOrName('id-1', undefined, { message: 'id or name required' });
  assert.equal(error, null);
}

{
  const items = [
    { id: 'a', name: 'body' },
    { id: 'b', name: 'head' }
  ];
  const error = ensureIdNameMatch(items, 'a', 'head', { kind: 'cube', plural: 'cubes' });
  assert.equal(error?.code, 'invalid_payload');
  assert.equal(error?.message, 'cube id/name mismatch.');
}

{
  const items = [
    { id: 'a', name: 'body' },
    { id: 'b', name: 'head' }
  ];
  const error = ensureIdNameMatch(items, 'a', 'head', {
    kind: 'cube',
    plural: 'cubes',
    message: ({ id, name, kind }) => `${kind}:${id}:${name}`
  });
  assert.equal(error?.message, 'cube:a:head');
}

{
  const items = [
    { id: 'a', name: 'body' },
    { id: 'b', name: 'head' }
  ];
  const error = ensureIdNameMatch(items, 'a', 'body', { kind: 'cube', plural: 'cubes' });
  assert.equal(error, null);
}

