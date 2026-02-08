import assert from 'node:assert/strict';

import { runDeleteTexture, runImportTexture, runUpdateTexture } from '../src/adapters/blockbench/texture/textureCommands';
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
  ctx: { clearRect: (...args: unknown[]) => void; drawImage: (...args: unknown[]) => void };
  canvas: { width: number; height: number; getContext: (type: string) => unknown };

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

class NoCanvasTexture {
  static all: NoCanvasTexture[] = [];
  name?: string;
  width?: number;
  height?: number;
  internal?: boolean;
  keep_size?: boolean;

  constructor(options: { name?: string; width?: number; height?: number }) {
    this.name = options.name;
    this.width = options.width ?? 16;
    this.height = options.height ?? 16;
  }

  add() {
    NoCanvasTexture.all.push(this);
  }
}

// If no preview renderer exists, texture path should emit a fallback event.
{
  FakeTexture.all = [];
  new FakeTexture({ name: 'tex', width: 16, height: 16 }).add();
  const dispatched: Array<{ name: string; payload?: unknown }> = [];
  withGlobals(
    {
      Texture: FakeTexture,
      Preview: { selected: null, all: [] },
      Blockbench: {
        dispatchEvent: (name: string, payload?: unknown) => {
          dispatched.push({ name, payload });
        }
      },
      Undo: undefined
    },
    () => {
      const err = runUpdateTexture(noopLog, {
        name: 'tex',
        image: {} as CanvasImageSource,
        width: 16,
        height: 16
      });
      assert.equal(err, null);
    }
  );
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0]?.name, 'ashfox:texture_changed');
  assert.equal((dispatched[0]?.payload as { source?: string })?.source, 'texture_commands');
}

// Selected preview duplicated in Preview.all should render only once.
{
  FakeTexture.all = [];
  new FakeTexture({ name: 'tex', width: 16, height: 16 }).add();
  let firstCalls = 0;
  let secondCalls = 0;
  const previewFirst = { render: () => { firstCalls += 1; } };
  const previewSecond = { render: () => { secondCalls += 1; } };
  withGlobals(
    {
      Texture: FakeTexture,
      Preview: { selected: previewFirst, all: [previewFirst, previewSecond] },
      Blockbench: undefined,
      Undo: undefined
    },
    () => {
      const err = runUpdateTexture(noopLog, {
        name: 'tex',
        image: {} as CanvasImageSource,
        width: 16,
        height: 16
      });
      assert.equal(err, null);
    }
  );
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
}

// Missing canvas/edit support should report not_implemented on import.
{
  NoCanvasTexture.all = [];
  withGlobals(
    {
      Texture: NoCanvasTexture,
      Preview: undefined,
      Blockbench: undefined,
      Undo: undefined
    },
    () => {
      const err = runImportTexture(noopLog, {
        name: 'no_canvas',
        image: {} as CanvasImageSource,
        width: 16,
        height: 16
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

// Unexpected texture update exceptions should map to io_error.
{
  FakeTexture.all = [];
  const tex = new FakeTexture({ name: 'tex', width: 16, height: 16 });
  tex.updateChangesAfterEdit = () => {
    throw new Error('update fail');
  };
  tex.add();
  withGlobals(
    {
      Texture: FakeTexture,
      Preview: undefined,
      Blockbench: undefined,
      Undo: undefined
    },
    () => {
      const err = runUpdateTexture(noopLog, {
        name: 'tex',
        image: {} as CanvasImageSource,
        width: 16,
        height: 16
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'io_error');
    }
  );
}

// Delete failures should preserve adapter_exception details for QA triage.
{
  FakeTexture.all = [];
  const tex = new FakeTexture({ name: 'tex', width: 16, height: 16 }) as FakeTexture & { remove: () => never };
  tex.remove = () => {
    throw new Error('delete fail');
  };
  tex.add();
  withGlobals(
    {
      Texture: FakeTexture,
      Preview: undefined,
      Blockbench: undefined,
      Undo: undefined
    },
    () => {
      const err = runDeleteTexture(noopLog, { name: 'tex' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.reason, 'adapter_exception');
      assert.equal(err?.details?.context, 'texture_delete');
    }
  );
}


