import assert from 'node:assert/strict';

import { runImportTexture, runUpdateTexture } from '../src/adapters/blockbench/texture/textureCommands';
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

class FakeTexture {
  static all: FakeTexture[] = [];

  name?: string;
  width?: number;
  height?: number;
  ashfoxId?: string;
  internal?: boolean;
  keep_size?: boolean;
  canvas: { width: number; height: number; getContext: (type: string) => unknown };
  ctx: { clearRect: (...args: unknown[]) => void; drawImage: (...args: unknown[]) => void };

  constructor(options: { name?: string; width?: number; height?: number }) {
    this.name = options.name;
    this.width = options.width ?? 16;
    this.height = options.height ?? 16;
    this.ctx = {
      clearRect: () => undefined,
      drawImage: () => undefined
    };
    this.canvas = {
      width: this.width,
      height: this.height,
      getContext: (type: string) => (type === '2d' ? this.ctx : null)
    };
  }

  add() {
    FakeTexture.all.push(this);
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  updateChangesAfterEdit() {
    return undefined;
  }
}

// Update texture should render preview once for immediate viewport refresh.
{
  FakeTexture.all = [];
  const tex = new FakeTexture({ name: 'minecraft_dragon', width: 64, height: 64 });
  tex.add();
  let previewRenderCalls = 0;
  withGlobals(
    {
      Texture: FakeTexture,
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
      const err = runUpdateTexture(noopLog, {
        name: 'minecraft_dragon',
        image: {} as CanvasImageSource,
        width: 64,
        height: 64
      });
      assert.equal(err, null);
    }
  );
  assert.equal(previewRenderCalls, 1);
}

// Import texture should also render preview once.
{
  FakeTexture.all = [];
  let previewRenderCalls = 0;
  withGlobals(
    {
      Texture: FakeTexture,
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
      const err = runImportTexture(noopLog, {
        name: 'imported_tex',
        image: {} as CanvasImageSource,
        width: 32,
        height: 32
      });
      assert.equal(err, null);
    }
  );
  assert.equal(FakeTexture.all.length, 1);
  assert.equal(previewRenderCalls, 1);
}

