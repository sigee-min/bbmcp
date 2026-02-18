import assert from 'node:assert/strict';

import { resolveWorkerRuntimeConfig } from '../src/config';

const withEnv = (entries: Record<string, string | undefined>, run: () => void): void => {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(entries)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

module.exports = () => {
  withEnv(
    {
      ASHFOX_WORKER_LOG_LEVEL: 'debug',
      ASHFOX_WORKER_HEARTBEAT_MS: '2500',
      ASHFOX_WORKER_POLL_MS: '1000',
      ASHFOX_WORKER_NATIVE_PIPELINE: '1',
      ASHFOX_WORKER_ID: 'worker-test'
    },
    () => {
      const config = resolveWorkerRuntimeConfig(process.env);
      assert.equal(config.logLevel, 'debug');
      assert.equal(config.heartbeatMs, 2500);
      assert.equal(config.pollMs, 1000);
      assert.equal(config.enableNativePipeline, true);
      assert.equal(config.workerId, 'worker-test');
    }
  );

  withEnv(
    {
      ASHFOX_WORKER_HEARTBEAT_MS: '0',
      ASHFOX_WORKER_POLL_MS: '-1',
      ASHFOX_WORKER_NATIVE_PIPELINE: '0',
      ASHFOX_WORKER_ID: ''
    },
    () => {
      const config = resolveWorkerRuntimeConfig(process.env);
      assert.equal(config.heartbeatMs, 5000);
      assert.equal(config.pollMs, 1200);
      assert.equal(config.enableNativePipeline, false);
      assert.ok(config.workerId.startsWith('worker-'));
    }
  );
};
