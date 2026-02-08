import assert from 'node:assert/strict';

import type { Logger } from '../src/logging';
import { BlockbenchSnapshot } from '../src/adapters/blockbench/BlockbenchSnapshot';

type TestGlobals = {
  Blockbench?: unknown;
  Project?: unknown;
  Outliner?: unknown;
  Texture?: unknown;
  Animations?: unknown;
  Animation?: unknown;
  Format?: unknown;
  ModelFormat?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as unknown as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Project: globals.Project,
    Outliner: globals.Outliner,
    Texture: globals.Texture,
    Animations: globals.Animations,
    Animation: globals.Animation,
    Format: globals.Format,
    ModelFormat: globals.ModelFormat
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Project = overrides.Project;
  globals.Outliner = overrides.Outliner;
  globals.Texture = overrides.Texture;
  globals.Animations = overrides.Animations;
  globals.Animation = overrides.Animation;
  globals.Format = overrides.Format;
  globals.ModelFormat = overrides.ModelFormat;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Project = before.Project;
    globals.Outliner = before.Outliner;
    globals.Texture = before.Texture;
    globals.Animations = before.Animations;
    globals.Animation = before.Animation;
    globals.Format = before.Format;
    globals.ModelFormat = before.ModelFormat;
  }
};

{
  const snapshot = new BlockbenchSnapshot();
  withGlobals(
    {
      Project: {
        name: 'dragon',
        uuid: 'project-id',
        ashfoxUvPixelsPerBlock: 24
      },
      Blockbench: {
        hasUnsavedChanges: () => true
      },
      Format: { id: 'geckolib' },
      Outliner: {
        root: [
          {
            name: 'body',
            origin: [0, 0, 0],
            rotation: [0, 10, 0],
            children: [
              {
                name: 'body_main',
                from: [-4, 6, -7],
                to: [4, 14, 7],
                uv_offset: [0, 0],
                visibility: true,
                box_uv: true
              }
            ]
          }
        ]
      },
      Texture: {
        all: [
          {
            id: 'tex-1',
            name: 'minecraft_dragon',
            width: 64,
            height: 64
          }
        ]
      },
      Animations: [
        {
          id: 'anim-1',
          name: 'idle',
          length: 2,
          loop: 'loop',
          snapping: 20,
          animators: {
            body: {
              keyframes: [
                { channel: 'rotation', time: 0, data_points: [0, 0, 0] },
                { channel: 'timeline', time: 1, data_point: 'tick' }
              ]
            }
          }
        }
      ],
      Animation: { selected: null, all: [] }
    },
    () => {
      const result = snapshot.readSnapshot();
      assert.notEqual(result, null);
      assert.equal(result?.id, 'project-id');
      assert.equal(result?.name, 'dragon');
      assert.equal(result?.dirty, true);
      assert.equal(result?.format, 'geckolib');
      assert.equal(result?.uvPixelsPerBlock, 24);
      assert.equal(result?.bones.length, 1);
      assert.equal(result?.cubes.length, 1);
      assert.equal(result?.textures.length, 1);
      assert.equal(result?.animations.length, 1);
      assert.equal(result?.animationsStatus, 'available');
      assert.equal(result?.animations[0].channels?.length, 1);
      assert.equal(result?.animations[0].triggers?.length, 1);
      assert.equal(result?.animationTimePolicy.timeEpsilon, 1e-9);
    }
  );
}

{
  const snapshot = new BlockbenchSnapshot();
  withGlobals(
    {
      Project: {
        name: 'generic-rig',
        id: 'generic-id'
      },
      Format: { id: 'free' },
      Outliner: { root: [] },
      Texture: { all: [] },
      Animations: []
    },
    () => {
      const result = snapshot.readSnapshot();
      assert.notEqual(result, null);
      assert.equal(result?.format, 'Generic Model');
      assert.equal(result?.formatId, 'free');
    }
  );
}

{
  const snapshot = new BlockbenchSnapshot();
  withGlobals(
    {
      Project: {
        name: 'root-only',
        id: 'root-id',
        dirty: false,
        ashfox: { uv_pixels_per_block: 32 }
      },
      Format: { id: 'minecraft_block' },
      Outliner: {
        root: [
          {
            name: 'cube_only',
            from: [0, 0, 0],
            to: [1, 1, 1]
          }
        ]
      },
      Texture: { all: [] },
      Animations: []
    },
    () => {
      const result = snapshot.readSnapshot();
      assert.notEqual(result, null);
      assert.equal(result?.bones[0].name, 'root');
      assert.equal(result?.cubes[0].bone, 'root');
      assert.equal(result?.uvPixelsPerBlock, 32);
      assert.equal(result?.dirty, false);
    }
  );
}

{
  const messages: string[] = [];
  const logger: Logger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (_msg: string, fields?: Record<string, unknown>) => {
      const text = typeof fields?.message === 'string' ? fields.message : 'unknown';
      messages.push(text);
    }
  };
  const snapshot = new BlockbenchSnapshot(logger);
  const throwingOutliner = {};
  Object.defineProperty(throwingOutliner, 'root', {
    get: () => {
      throw new Error('root broken');
    }
  });
  withGlobals(
    {
      Project: { name: 'broken' },
      Outliner: throwingOutliner
    },
    () => {
      const result = snapshot.readSnapshot();
      assert.equal(result, null);
      assert.equal(messages.length, 1);
      assert.equal(messages[0].includes('root broken'), true);
    }
  );
}

