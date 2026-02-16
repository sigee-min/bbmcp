import assert from 'node:assert/strict';

import { GET } from '../src/app/api/health/route';

module.exports = async () => {
  const previousBackend = process.env.ASHFOX_NATIVE_PIPELINE_BACKEND;
  const previousPreset = process.env.ASHFOX_PERSISTENCE_PRESET;

  process.env.ASHFOX_NATIVE_PIPELINE_BACKEND = 'memory';
  process.env.ASHFOX_PERSISTENCE_PRESET = 'selfhost';
  const response = await GET();
  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    ok?: boolean;
    service?: string;
    queueBackend?: string;
    persistencePreset?: string;
    timestamp?: string;
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.service, 'ashfox-web');
  assert.equal(payload.queueBackend, 'memory');
  assert.equal(payload.persistencePreset, 'selfhost');
  assert.equal(typeof payload.timestamp, 'string');

  if (previousBackend === undefined) {
    delete process.env.ASHFOX_NATIVE_PIPELINE_BACKEND;
  } else {
    process.env.ASHFOX_NATIVE_PIPELINE_BACKEND = previousBackend;
  }
  if (previousPreset === undefined) {
    delete process.env.ASHFOX_PERSISTENCE_PRESET;
  } else {
    process.env.ASHFOX_PERSISTENCE_PRESET = previousPreset;
  }
};
