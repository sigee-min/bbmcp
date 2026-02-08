import assert from 'node:assert/strict';

import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PATH, DEFAULT_SERVER_PORT } from '../src/config';
import { resolveEndpointConfig } from '../src/plugin/endpointConfig';

const withEnv = (changes: Record<string, string | undefined>, run: () => void) => {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(changes)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

withEnv(
  {
    ASHFOX_HOST: undefined,
    ASHFOX_PORT: undefined,
    ASHFOX_PATH: undefined
  },
  () => {
    const config = resolveEndpointConfig();
    assert.equal(config.host, DEFAULT_SERVER_HOST);
    assert.equal(config.port, DEFAULT_SERVER_PORT);
    assert.equal(config.path, DEFAULT_SERVER_PATH);
  }
);

withEnv(
  {
    ASHFOX_HOST: '127.0.0.1',
    ASHFOX_PORT: '9999',
    ASHFOX_PATH: 'mcp-api'
  },
  () => {
    const config = resolveEndpointConfig();
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 9999);
    assert.equal(config.path, '/mcp-api');
  }
);

withEnv(
  {
    ASHFOX_HOST: ' ',
    ASHFOX_PORT: '70000',
    ASHFOX_PATH: ' '
  },
  () => {
    const config = resolveEndpointConfig();
    assert.equal(config.host, DEFAULT_SERVER_HOST);
    assert.equal(config.port, DEFAULT_SERVER_PORT);
    assert.equal(config.path, DEFAULT_SERVER_PATH);
  }
);

