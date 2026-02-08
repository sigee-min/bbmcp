import assert from 'node:assert/strict';

import { createLineDecoder, encodeMessage } from '../src/transport/codec';
import { isSidecarMessage } from '../src/transport/protocol';

{
  const encoded = encodeMessage({ type: 'ready', version: 1, ts: 1 });
  assert.equal(encoded.endsWith('\n'), true);
  assert.equal(encoded.includes('"type":"ready"'), true);
}

{
  assert.equal(isSidecarMessage(null), false);
  assert.equal(isSidecarMessage({ type: 'hello', version: 1, role: 'plugin', ts: 1 }), true);
  assert.equal(isSidecarMessage({ type: 'hello', version: 1, role: 'invalid', ts: 1 }), false);
  assert.equal(isSidecarMessage({ type: 'ready', version: Number.NaN, ts: 1 }), false);
  assert.equal(isSidecarMessage({ type: 'request', id: '', tool: 'list_capabilities', ts: 1 }), false);
  assert.equal(isSidecarMessage({ type: 'request', id: 'r1', tool: 'list_capabilities', ts: 1 }), true);
  assert.equal(
    isSidecarMessage({
      type: 'response',
      id: 'r1',
      ok: false,
      error: { code: 'invalid_state', message: 'x', details: 'bad' },
      ts: 1
    }),
    false
  );
  assert.equal(
    isSidecarMessage({
      type: 'response',
      id: 'r1',
      ok: false,
      error: { code: 'invalid_state', message: 'x', details: { reason: 'y' } },
      ts: 1
    }),
    true
  );
  assert.equal(
    isSidecarMessage({
      type: 'response',
      id: 'r1',
      ok: true,
      data: { ok: true },
      ts: 1
    }),
    true
  );
  assert.equal(isSidecarMessage({ type: 'noop', ts: 1 }), false);
  assert.equal(
    isSidecarMessage({
      type: 'error',
      message: 'boom',
      id: 1,
      ts: 1
    }),
    false
  );
  assert.equal(
    isSidecarMessage({
      type: 'error',
      message: 'boom',
      details: { reason: 'x' },
      ts: 1
    }),
    true
  );
}

{
  const messages: unknown[] = [];
  let errors = 0;
  const decoder = createLineDecoder(
    (message) => {
      messages.push(message);
    },
    () => {
      errors += 1;
    },
    200
  );

  decoder.push('x'.repeat(250));
  assert.equal(errors, 1);

  decoder.push('{"type":"ready","version":1,"ts":2}\n');
  assert.equal(messages.length, 1);
}

{
  const messages: unknown[] = [];
  let errors = 0;
  const decoder = createLineDecoder(
    (message) => {
      messages.push(message);
    },
    () => {
      errors += 1;
    }
  );

  decoder.push(new Uint8Array(Buffer.from('{"type":"ready","version":1,"ts":3}\n', 'utf8')));
  decoder.push(' \n');
  decoder.push('{"type":"ready","version":1}\n');
  assert.equal(messages.length, 1);
  assert.equal(errors, 1);
}

{
  const messages: unknown[] = [];
  let errors = 0;
  const decoder = createLineDecoder(
    (message) => {
      messages.push(message);
    },
    () => {
      errors += 1;
    }
  );

  decoder.push('{"type":"ready","version":1,');
  decoder.end();
  decoder.push('"ts":4}\n');
  assert.equal(messages.length, 0);
  assert.equal(errors, 1);
}
