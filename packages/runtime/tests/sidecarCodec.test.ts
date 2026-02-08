import assert from 'node:assert/strict';

import { createLineDecoder } from '../src/transport/codec';

{
  let messages = 0;
  let errors = 0;
  const decoder = createLineDecoder(
    () => {
      messages += 1;
    },
    () => {
      errors += 1;
    }
  );

  decoder.push('{"type":"hello","version":1,"role":"sidecar","ts":1}\n');
  assert.equal(messages, 1);
  assert.equal(errors, 0);
}

{
  let messages = 0;
  let errors = 0;
  const decoder = createLineDecoder(
    () => {
      messages += 1;
    },
    () => {
      errors += 1;
    }
  );

  decoder.push('{"type":"hello","version":1,"role":"sidecar"}\n');
  assert.equal(messages, 0);
  assert.equal(errors, 1);
}

{
  let messages = 0;
  let errors = 0;
  const decoder = createLineDecoder(
    () => {
      messages += 1;
    },
    () => {
      errors += 1;
    }
  );

  decoder.push('{not json}\n');
  assert.equal(messages, 0);
  assert.equal(errors, 1);
}

