import assert from 'node:assert/strict';

import { sanitizeTraceValue } from '../../src/trace/traceLogFormat';

{
  const input = {
    keep: 'ok',
    image: 'data:image/png;base64,abc',
    nested: { ctx: { secret: 'x' }, value: 1 }
  };
  const sanitized = sanitizeTraceValue(input) as Record<string, unknown>;
  assert.equal(sanitized.keep, 'ok');
  assert.equal(sanitized.image, '<redacted>');
  assert.deepEqual(sanitized.nested, { ctx: '<redacted>', value: 1 });
}

{
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const sanitized = sanitizeTraceValue(circular) as Record<string, unknown>;
  assert.equal(sanitized.self, '[circular]');
}

{
  const large: Record<string, number> = {};
  for (let i = 0; i < 105; i += 1) {
    large[`k${i}`] = i;
  }
  const sanitized = sanitizeTraceValue(large) as Record<string, unknown>;
  assert.equal(Object.keys(sanitized).length, 101);
  assert.equal(sanitized.__ashfoxTruncatedKeys__, '[truncated:5]');
  assert.equal(sanitized.k0, 0);
  assert.equal(sanitized.k99, 99);
  assert.equal('k100' in sanitized, false);
}

