import assert from 'node:assert/strict';

import type { Logger } from '../src/logging';
import { BlockbenchProjectAdapter } from '../src/adapters/blockbench/BlockbenchProjectAdapter';
import { PROJECT_NO_ACTIVE } from '../src/shared/messages';

type TestGlobals = {
  Blockbench?: unknown;
  Project?: unknown;
  setProjectResolution?: (width: number, height: number, modifyUv?: boolean) => void;
  updateProjectResolution?: () => void;
};

const logger: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Project: globals.Project,
    setProjectResolution: globals.setProjectResolution,
    updateProjectResolution: globals.updateProjectResolution
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Project = overrides.Project;
  globals.setProjectResolution = overrides.setProjectResolution;
  globals.updateProjectResolution = overrides.updateProjectResolution;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Project = before.Project;
    globals.setProjectResolution = before.setProjectResolution;
    globals.updateProjectResolution = before.updateProjectResolution;
  }
};

{
  withGlobals({}, () => {
    const adapter = new BlockbenchProjectAdapter(logger);
    assert.equal(adapter.getProjectTextureResolution(), null);
  });
}

{
  withGlobals(
    {
      Project: { texture_width: 64, texture_height: 32 }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      assert.deepEqual(adapter.getProjectTextureResolution(), { width: 64, height: 32 });
    }
  );
}

{
  withGlobals(
    {
      Project: null
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.setProjectTextureResolution(32, 32, true);
      assert.deepEqual(err, { code: 'invalid_state', message: PROJECT_NO_ACTIVE });
    }
  );
}

{
  let callCount = 0;
  let updateCount = 0;
  let captured: { width: number; height: number; modifyUv: boolean } | null = null;
  withGlobals(
    {
      Project: { texture_width: 16, texture_height: 16 },
      setProjectResolution: (width, height, modifyUv) => {
        callCount += 1;
        captured = { width, height, modifyUv: Boolean(modifyUv) };
      },
      updateProjectResolution: () => {
        updateCount += 1;
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.setProjectTextureResolution(32, 48, true);
      assert.equal(err, null);
      assert.equal(callCount, 1);
      assert.equal(updateCount, 1);
      assert.deepEqual(captured, { width: 32, height: 48, modifyUv: true });
    }
  );
}

{
  let updateCount = 0;
  const project = {
    texture_width: 16,
    texture_height: 16,
    setTextureSize(width: number, height: number) {
      this.texture_width = width;
      this.texture_height = height;
    }
  };
  withGlobals(
    {
      Project: project,
      updateProjectResolution: () => {
        updateCount += 1;
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.setProjectTextureResolution(24, 40, false);
      assert.equal(err, null);
      assert.equal(project.texture_width, 24);
      assert.equal(project.texture_height, 40);
      assert.equal(updateCount, 1);
    }
  );
}

{
  const project: Record<string, unknown> = {};
  withGlobals(
    {
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.setProjectUvPixelsPerBlock(32);
      assert.equal(err, null);
      assert.equal(project.ashfoxUvPixelsPerBlock, 32);
      assert.deepEqual(project.ashfox, { uvPixelsPerBlock: 32, uv_pixels_per_block: 32 });
    }
  );
}
