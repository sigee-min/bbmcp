import assert from 'node:assert/strict';

import type { Logger } from '../src/logging';
import { ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED, PROJECT_NO_ACTIVE } from '../src/shared/messages';
import { BlockbenchProjectAdapter } from '../src/adapters/blockbench/BlockbenchProjectAdapter';

type TestGlobals = {
  Blockbench?: unknown;
  Project?: unknown;
};

const logger: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const getGlobals = (): TestGlobals => globalThis as unknown as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = { Blockbench: globals.Blockbench, Project: globals.Project };
  globals.Blockbench = overrides.Blockbench;
  globals.Project = overrides.Project;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Project = before.Project;
  }
};

{
  withGlobals({}, () => {
    const adapter = new BlockbenchProjectAdapter(logger);
    const err = adapter.closeProject();
    assert.deepEqual(err, { code: 'invalid_state', message: PROJECT_NO_ACTIVE });
  });
}

{
  let closeArg: boolean | undefined;
  const project = {
    saved: true,
    close(force: boolean) {
      closeArg = force;
      return undefined;
    }
  };
  withGlobals(
    {
      Blockbench: {
        project,
        hasUnsavedChanges: () => false
      },
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.closeProject({ force: true });
      assert.equal(err, null);
      assert.equal(closeArg, true);
    }
  );
}

{
  const project = {
    saved: true,
    close() {
      return Promise.resolve();
    }
  };
  withGlobals(
    {
      Blockbench: {
        project,
        hasUnsavedChanges: () => false
      },
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.closeProject();
      assert.ok(err);
      assert.equal(err?.code, 'not_implemented');
      assert.equal(err?.message, ADAPTER_PROJECT_CLOSE_ASYNC_UNSUPPORTED);
    }
  );
}
