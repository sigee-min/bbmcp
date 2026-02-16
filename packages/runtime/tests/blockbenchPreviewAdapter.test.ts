import assert from 'node:assert/strict';

import { BlockbenchPreviewAdapter } from '../src/adapters/blockbench/BlockbenchPreviewAdapter';
import { noopLog } from './helpers';

type TestGlobals = {
  Preview?: unknown;
  document?: unknown;
  Animation?: unknown;
  Animations?: unknown;
  Animator?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Preview: globals.Preview,
    document: globals.document,
    Animation: globals.Animation,
    Animations: globals.Animations,
    Animator: globals.Animator
  };
  globals.Preview = overrides.Preview;
  globals.document = overrides.document;
  globals.Animation = overrides.Animation;
  globals.Animations = overrides.Animations;
  globals.Animator = overrides.Animator;
  try {
    run();
  } finally {
    globals.Preview = before.Preview;
    globals.document = before.document;
    globals.Animation = before.Animation;
    globals.Animations = before.Animations;
    globals.Animator = before.Animator;
  }
};

const createCanvas = (dataUrl = 'data:image/png;base64,QQ==', width = 16, height = 16) => ({
  width,
  height,
  toDataURL: () => dataUrl
});

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  const invalidFixed = adapter.renderPreview({ mode: 'fixed', output: 'sequence' });
  assert.equal(invalidFixed.error?.code, 'invalid_payload');

  const invalidTurntable = adapter.renderPreview({ mode: 'turntable', output: 'single' });
  assert.equal(invalidTurntable.error?.code, 'invalid_payload');
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  withGlobals(
    {
      Preview: { selected: null, all: [] },
      document: { querySelector: () => null }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'fixed' });
      assert.equal(result.error?.code, 'not_implemented');
    }
  );
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  withGlobals(
    {
      Preview: {
        selected: {
          canvas: createCanvas(),
          render: () => undefined
        },
        all: []
      }
    },
    () => {
      const missingControls = adapter.renderPreview({ mode: 'fixed', angle: [10, 20] });
      assert.equal(missingControls.error?.code, 'not_implemented');

      const missingClip = adapter.renderPreview({ mode: 'fixed', timeSeconds: 1 });
      assert.equal(missingClip.error?.code, 'invalid_payload');
    }
  );
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  let updates = 0;
  let renders = 0;
  const canvas = createCanvas('data:image/png;base64,QQ==', 32, 16);
  withGlobals(
    {
      Preview: {
        selected: {
          canvas,
          controls: {
            update: () => {
              updates += 1;
            }
          },
          camera: {},
          render: () => {
            renders += 1;
          }
        },
        all: []
      }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'fixed', angle: [0, 0, 0] });
      assert.equal(result.error, undefined);
      assert.equal(result.result?.kind, 'single');
      assert.equal(result.result?.frameCount, 1);
      assert.equal(result.result?.image?.width, 32);
      assert.equal(result.result?.image?.height, 16);
    }
  );
  assert.equal(updates > 0, true);
  assert.equal(renders > 0, true);
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  let rotateCalls = 0;
  const canvas = createCanvas('data:image/png;base64,QQ==', 16, 16);
  withGlobals(
    {
      Preview: {
        selected: {
          canvas,
          controls: {
            rotateLeft: () => {
              rotateCalls += 1;
            },
            update: () => undefined
          },
          camera: {},
          render: () => undefined
        },
        all: []
      }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'turntable', durationSeconds: 2, fps: 100 });
      assert.equal(result.error, undefined);
      assert.equal(result.result?.kind, 'sequence');
      assert.equal(result.result?.frameCount, 120);
      assert.equal(result.result?.frames?.length, 120);
    }
  );
  assert.equal(rotateCalls, 119);
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  withGlobals(
    {
      Preview: {
        selected: {
          canvas: createCanvas('data:text/plain,abc'),
          controls: { update: () => undefined },
          camera: {},
          render: () => undefined
        },
        all: []
      }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'fixed' });
      assert.equal(result.error?.code, 'io_error');
    }
  );
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  withGlobals(
    {
      Animations: [],
      Animation: { selected: null, all: [] },
      Preview: {
        selected: {
          canvas: createCanvas(),
          controls: { update: () => undefined },
          camera: {},
          render: () => undefined
        },
        all: []
      }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'fixed', clip: 'idle', timeSeconds: 0 });
      assert.equal(result.error?.code, 'invalid_payload');
    }
  );
}

{
  const adapter = new BlockbenchPreviewAdapter(noopLog);
  withGlobals(
    {
      Preview: {
        selected: {
          canvas: {
            width: 16,
            height: 16,
            toDataURL: () => {
              throw new Error('boom');
            }
          },
          controls: { update: () => undefined },
          camera: {},
          render: () => undefined
        },
        all: []
      }
    },
    () => {
      const result = adapter.renderPreview({ mode: 'fixed' });
      assert.equal(result.error?.code, 'unknown');
    }
  );
}
