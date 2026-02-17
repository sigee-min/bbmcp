import assert from 'node:assert/strict';

import {
  runListTextures,
  runDeleteTexture,
  runReadTexture,
  runUpdateTexture
} from '../src/adapters/blockbench/texture/textureCommands';
import {
  ADAPTER_TEXTURE_CANVAS_UNAVAILABLE,
  ADAPTER_TEXTURE_DATA_UNAVAILABLE,
  TEXTURE_NOT_FOUND
} from '../src/shared/messages';
import { noopLog } from './helpers';
import { withGlobals } from './support/withGlobals';

class FakeTexture {
  static all: FakeTexture[] = [];

  id?: string;
  name?: string;
  path?: string;
  source?: string;
  width?: number;
  height?: number;
  ashfoxId?: string;
  canvas?: { width: number; height: number; getContext?: (type: string) => unknown; toDataURL?: () => string };
  ctx?: { clearRect: (...args: unknown[]) => void; drawImage: (...args: unknown[]) => void };
  img?: { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  getDataUrl?: () => string;

  constructor(options: { id?: string; name?: string; width?: number; height?: number } = {}) {
    this.id = options.id;
    this.name = options.name;
    this.width = options.width ?? 16;
    this.height = options.height ?? 16;
  }

  add() {
    FakeTexture.all.push(this);
  }
}

class NoCanvasTexture {
  static all: NoCanvasTexture[] = [];
  id?: string;
  name?: string;
  width?: number;
  height?: number;

  constructor(options: { id?: string; name?: string; width?: number; height?: number } = {}) {
    this.id = options.id;
    this.name = options.name;
    this.width = options.width ?? 16;
    this.height = options.height ?? 16;
  }
}

{
  withGlobals({ Texture: undefined }, () => {
    const res = runReadTexture(noopLog, { name: 'missing' });
    assert.equal(res.error?.code, 'invalid_state');
  });
}

{
  FakeTexture.all = [];
  withGlobals({ Texture: FakeTexture }, () => {
    const res = runReadTexture(noopLog, { name: 'missing' });
    assert.deepEqual(res.error, { code: 'invalid_payload', message: TEXTURE_NOT_FOUND('missing') });
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-1', name: 'atlas' });
  tex.add();
  withGlobals({ Texture: FakeTexture }, () => {
    const res = runReadTexture(noopLog, { name: 'atlas' });
    assert.deepEqual(res.error, { code: 'invalid_state', message: ADAPTER_TEXTURE_DATA_UNAVAILABLE });
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-2', name: 'atlas', width: 64, height: 32 });
  tex.path = '/tmp/atlas.png';
  tex.img = { naturalWidth: 64, naturalHeight: 32 };
  tex.getDataUrl = () => 'data:image/png;base64,AAAA';
  tex.add();
  withGlobals({ Texture: FakeTexture }, () => {
    const res = runReadTexture(noopLog, { id: 'tex-2' });
    assert.equal(res.error, undefined);
    assert.equal(res.result?.id, 'tex-2');
    assert.equal(res.result?.name, 'atlas');
    assert.equal(res.result?.width, 64);
    assert.equal(res.result?.height, 32);
    assert.equal(res.result?.path, '/tmp/atlas.png');
    assert.equal(res.result?.dataUri, 'data:image/png;base64,AAAA');
    assert.equal(Boolean(res.result?.image), true);
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-3', name: 'atlas', width: 16, height: 16 });
  tex.getDataUrl = () => {
    throw new Error('read boom');
  };
  tex.add();
  withGlobals({ Texture: FakeTexture }, () => {
    const res = runReadTexture(noopLog, { id: 'tex-3' });
    assert.equal(res.error?.code, 'unknown');
    assert.equal(res.error?.details?.context, 'texture_read');
    assert.equal(res.error?.details?.reason, 'adapter_exception');
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-4', name: 'atlas', width: 16, height: 16 });
  tex.canvas = {
    width: 16,
    height: 16,
    getContext: (type: string) =>
      type === '2d'
        ? {
            clearRect: () => undefined,
            drawImage: () => undefined
          }
        : null
  };
  tex.ctx = tex.canvas.getContext?.('2d') as { clearRect: () => void; drawImage: () => void };
  tex.add();
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const log = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnings.push({ message, meta });
    },
    error: () => undefined
  };
  withGlobals(
    {
      Texture: FakeTexture,
      Preview: {
        get selected() {
          throw new Error('preview boom');
        }
      },
      Blockbench: {}
    },
    () => {
      const err = runUpdateTexture(log, {
        id: 'tex-4',
        image: {} as CanvasImageSource,
        width: 16,
        height: 16
      });
      assert.equal(err, null);
    }
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, 'texture viewport refresh failed');
  assert.equal(warnings[0]?.meta?.message, 'preview boom');
}

{
  NoCanvasTexture.all = [];
  const tex = new NoCanvasTexture({ id: 'tex-6', name: 'atlas', width: 16, height: 16 });
  NoCanvasTexture.all.push(tex);
  withGlobals({ Texture: NoCanvasTexture }, () => {
    const err = runUpdateTexture(noopLog, {
      id: 'tex-6',
      image: {} as CanvasImageSource,
      width: 16,
      height: 16
    });
    assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_TEXTURE_CANVAS_UNAVAILABLE });
  });
}

{
  FakeTexture.all = [];
  withGlobals({ Texture: FakeTexture }, () => {
    const err = runDeleteTexture(noopLog, { name: 'missing' });
    assert.deepEqual(err, { code: 'invalid_payload', message: TEXTURE_NOT_FOUND('missing') });
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-7', name: 'atlas', width: 16, height: 16 });
  FakeTexture.all.push(tex);
  withGlobals({ Texture: FakeTexture }, () => {
    const err = runDeleteTexture(noopLog, { id: 'tex-7' });
    assert.equal(err, null);
    assert.equal(FakeTexture.all.length, 0);
  });
}

{
  FakeTexture.all = [];
  const tex = new FakeTexture({ id: 'tex-5', name: 'atlas', width: 32, height: 48 });
  tex.source = 'memory://atlas';
  tex.add();
  withGlobals({ Texture: FakeTexture }, () => {
    const list = runListTextures();
    assert.deepEqual(list, [
      {
        id: 'tex-5',
        name: 'atlas',
        width: 32,
        height: 48,
        path: 'memory://atlas'
      }
    ]);
  });
}
