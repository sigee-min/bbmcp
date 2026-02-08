import assert from 'node:assert/strict';

import { buildTargetFilters, matchTargetFilters } from '../src/domain/targetFilters';

{
  const filters = buildTargetFilters(['id-1'], ['cube']);
  assert.equal(matchTargetFilters(filters, 'id-1', 'cube'), true);
  assert.equal(matchTargetFilters(filters, 'id-1', 'other'), false);
  assert.equal(matchTargetFilters(filters, 'other', 'cube'), false);
  assert.equal(matchTargetFilters(filters, undefined, 'cube'), false);
  assert.equal(matchTargetFilters(filters, 'id-1', undefined), false);
}

{
  const filters = buildTargetFilters(['id-1'], []);
  assert.equal(matchTargetFilters(filters, 'id-1', 'cube'), true);
  assert.equal(matchTargetFilters(filters, 'other', 'cube'), false);
}

{
  const filters = buildTargetFilters([], ['cube']);
  assert.equal(matchTargetFilters(filters, 'id-1', 'cube'), true);
  assert.equal(matchTargetFilters(filters, 'id-1', 'other'), false);
}

{
  const filters = buildTargetFilters(['  id-1  '], ['  cube  ']);
  assert.equal(matchTargetFilters(filters, 'id-1', 'cube'), true);
}
