import assert from 'node:assert/strict';

import { GET } from '../src/app/api/health/route';

module.exports = async () => {
  const keys = [
    'ASHFOX_NATIVE_PIPELINE_BACKEND',
    'ASHFOX_PERSISTENCE_PRESET',
    'ASHFOX_DB_PROVIDER',
    'ASHFOX_STORAGE_PROVIDER',
    'ASHFOX_DB_POSTGRES_URL',
    'ASHFOX_STORAGE_S3_ACCESS_KEY_ID',
    'ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY'
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;

  try {
    process.env.ASHFOX_NATIVE_PIPELINE_BACKEND = 'memory';
    process.env.ASHFOX_PERSISTENCE_PRESET = 'local';
    delete process.env.ASHFOX_DB_PROVIDER;
    delete process.env.ASHFOX_STORAGE_PROVIDER;
    delete process.env.ASHFOX_DB_POSTGRES_URL;
    delete process.env.ASHFOX_STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY;

    const readyResponse = await GET();
    assert.equal(readyResponse.status, 200);
    const readyPayload = (await readyResponse.json()) as {
      ok?: boolean;
      service?: string;
      queueBackend?: string;
      persistencePreset?: string;
      readiness?: {
        availability?: string;
        database?: { ready?: boolean };
        storage?: { ready?: boolean };
      };
      timestamp?: string;
    };
    assert.equal(readyPayload.ok, true);
    assert.equal(readyPayload.service, 'ashfox-web');
    assert.equal(readyPayload.queueBackend, 'memory');
    assert.equal(readyPayload.persistencePreset, 'local');
    assert.equal(readyPayload.readiness?.availability, 'ready');
    assert.equal(readyPayload.readiness?.database?.ready, true);
    assert.equal(readyPayload.readiness?.storage?.ready, true);
    assert.equal(typeof readyPayload.timestamp, 'string');

    process.env.ASHFOX_PERSISTENCE_PRESET = 'selfhost';
    process.env.ASHFOX_DB_PROVIDER = 'postgres';
    process.env.ASHFOX_STORAGE_PROVIDER = 's3';
    process.env.ASHFOX_DB_POSTGRES_URL = 'postgresql://selfhost:selfhost@127.0.0.1:5432/ashfox';
    delete process.env.ASHFOX_STORAGE_S3_ACCESS_KEY_ID;
    delete process.env.ASHFOX_STORAGE_S3_SECRET_ACCESS_KEY;

    const degradedResponse = await GET();
    assert.equal(degradedResponse.status, 503);
    const degradedPayload = (await degradedResponse.json()) as {
      ok?: boolean;
      persistencePreset?: string;
      readiness?: {
        availability?: string;
        database?: { ready?: boolean };
        storage?: { ready?: boolean };
      };
    };
    assert.equal(degradedPayload.ok, false);
    assert.equal(degradedPayload.persistencePreset, 'selfhost');
    assert.equal(degradedPayload.readiness?.availability, 'degraded');
    assert.equal(degradedPayload.readiness?.database?.ready, true);
    assert.equal(degradedPayload.readiness?.storage?.ready, false);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};
