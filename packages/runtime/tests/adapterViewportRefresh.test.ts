import assert from 'node:assert/strict';

import { BlockbenchAnimationAdapter } from '../src/adapters/blockbench/BlockbenchAnimationAdapter';
import { BlockbenchGeometryAdapter } from '../src/adapters/blockbench/BlockbenchGeometryAdapter';
import { noopLog } from './helpers';

const withGlobals = (overrides: Record<string, unknown>, fn: () => void) => {
  const globals = globalThis as Record<string, unknown>;
  const previous = Object.entries(overrides).map(([key, value]) => ({
    key,
    exists: Object.prototype.hasOwnProperty.call(globals, key),
    value: globals[key],
    next: value
  }));
  for (const entry of previous) {
    if (entry.next === undefined) delete globals[entry.key];
    else globals[entry.key] = entry.next;
  }
  try {
    fn();
  } finally {
    for (const entry of previous) {
      if (entry.exists) globals[entry.key] = entry.value;
      else delete globals[entry.key];
    }
  }
};

// Geometry adapter should refresh viewport once after a successful mutation.
{
  let previewRenderCalls = 0;
  const adapter = new BlockbenchGeometryAdapter(noopLog) as unknown as {
    cubes: { updateCube: (params: unknown) => unknown };
    updateCube: (params: unknown) => unknown;
  };
  adapter.cubes = {
    updateCube: () => null
  };
  withGlobals(
    {
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({ name: 'body_main', to: [4, 14, 7] });
      assert.equal(err, null);
    }
  );
  assert.equal(previewRenderCalls, 1);
}

// Geometry adapter should skip viewport refresh on mutation errors.
{
  let previewRenderCalls = 0;
  const adapter = new BlockbenchGeometryAdapter(noopLog) as unknown as {
    cubes: { updateCube: (params: unknown) => unknown };
    updateCube: (params: unknown) => unknown;
  };
  adapter.cubes = {
    updateCube: () => ({ code: 'invalid_payload', message: 'bad request' })
  };
  withGlobals(
    {
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Blockbench: undefined
    },
    () => {
      const err = adapter.updateCube({ name: 'body_main', to: [4, 14, 7] });
      assert.notEqual(err, null);
    }
  );
  assert.equal(previewRenderCalls, 0);
}

// Animation adapter should refresh viewport once after createAnimation.
{
  let previewRenderCalls = 0;
  class FakeAnimation {
    static all: FakeAnimation[] = [];
    constructor(_options: Record<string, unknown>) {}
    add() {
      FakeAnimation.all.push(this);
    }
  }
  const adapter = new BlockbenchAnimationAdapter(noopLog);
  withGlobals(
    {
      Animation: FakeAnimation,
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.createAnimation({ name: 'idle', length: 1, loop: true, fps: 24 });
      assert.equal(err, null);
    }
  );
  assert.equal(previewRenderCalls, 1);
}

// Animation adapter should skip viewport refresh when createAnimation fails.
{
  let previewRenderCalls = 0;
  const adapter = new BlockbenchAnimationAdapter(noopLog);
  withGlobals(
    {
      Animation: undefined,
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = adapter.createAnimation({ name: 'idle', length: 1, loop: true, fps: 24 });
      assert.notEqual(err, null);
    }
  );
  assert.equal(previewRenderCalls, 0);
}

