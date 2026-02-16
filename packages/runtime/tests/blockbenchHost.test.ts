import assert from 'node:assert/strict';

import { BlockbenchHost } from '../src/adapters/blockbench/BlockbenchHost';

type TestGlobals = {
  Plugins?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = { Plugins: globals.Plugins };
  globals.Plugins = overrides.Plugins;
  try {
    run();
  } finally {
    globals.Plugins = before.Plugins;
  }
};

{
  const host = new BlockbenchHost();
  withGlobals({}, () => {
    const error = host.schedulePluginReload(100);
    assert.equal(error?.code, 'not_implemented');
  });
}

{
  const host = new BlockbenchHost();
  let capturedDelay = -1;
  let reloadCalls = 0;
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, delay?: number) => {
    capturedDelay = Number(delay ?? 0);
    fn();
    return originalSetTimeout(() => undefined, 0);
  }) as typeof setTimeout;
  try {
    withGlobals(
      {
        Plugins: {
          devReload: () => {
            reloadCalls += 1;
          }
        }
      },
      () => {
        const error = host.schedulePluginReload(Number.NaN);
        assert.equal(error, null);
      }
    );
  } finally {
    (globalThis as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
  }
  assert.equal(capturedDelay, 100);
  assert.equal(reloadCalls, 1);
}

{
  const host = new BlockbenchHost();
  let capturedDelay = -1;
  const originalSetTimeout = globalThis.setTimeout;
  (globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((fn: () => void, delay?: number) => {
    capturedDelay = Number(delay ?? 0);
    return originalSetTimeout(() => undefined, 0);
  }) as typeof setTimeout;
  try {
    withGlobals(
      {
        Plugins: {
          devReload: () => undefined
        }
      },
      () => {
        const error = host.schedulePluginReload(50_000);
        assert.equal(error, null);
      }
    );
  } finally {
    (globalThis as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
  }
  assert.equal(capturedDelay, 10_000);
}
