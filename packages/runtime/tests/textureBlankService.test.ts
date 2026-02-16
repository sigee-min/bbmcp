import assert from 'node:assert/strict';

import { runCreateBlankTexture } from '../src/usecases/textureService/textureBlank';
import type { ToolError } from '../src/types';
import {
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX,
  TEXTURE_RENDERER_NO_IMAGE,
  TEXTURE_RENDERER_UNAVAILABLE
} from '../src/shared/messages';
import { createMockImage } from './fakes';

const normalizeMessage = (value: string): string => value.replace(/[.]$/, '');

const capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 128, maxTextureSize: 32, maxAnimationSeconds: 120 }
} as const;

const createHarness = (options?: {
  activeError?: ToolError | null;
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
  renderError?: ToolError;
  renderWithoutResult?: boolean;
  importError?: ToolError;
}) => {
  let importCalls = 0;
  let renderCalls = 0;
  let capturedData: Uint8ClampedArray | undefined;
  const ctx = {
    ensureActive: () => options?.activeError ?? null,
    capabilities,
    editor: {
      listTextures: () =>
        (options?.textures ?? []).map((texture) => ({
          ...texture,
          width: texture.width ?? 16,
          height: texture.height ?? 16
        })),
      getProjectTextureResolution: () => ({ width: 16, height: 16 })
    },
    textureRenderer: {
      renderPixels: ({ data }: { data: Uint8ClampedArray }) => {
        renderCalls += 1;
        capturedData = new Uint8ClampedArray(data);
        if (options?.renderError) return { error: options.renderError };
        if (options?.renderWithoutResult) return {};
        return { result: { image: createMockImage('data:image/png;base64,IMAG'), width: 16, height: 16 } };
      }
    },
    importTexture: () => {
      importCalls += 1;
      if (options?.importError) return { ok: false as const, error: options.importError };
      return { ok: true as const, value: { id: 'tex1', name: 'atlas' } };
    }
  };
  return {
    ctx,
    getImportCalls: () => importCalls,
    getRenderCalls: () => renderCalls,
    getCapturedData: () => capturedData
  };
};

{
  const { ctx } = createHarness();
  const res = runCreateBlankTexture({ ...ctx, textureRenderer: undefined } as never, { name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(normalizeMessage(res.error.message), normalizeMessage(TEXTURE_RENDERER_UNAVAILABLE));
}

{
  const { ctx, getImportCalls, getRenderCalls } = createHarness({
    textures: [{ id: 'tex_a', name: 'atlas' }]
  });
  const res = runCreateBlankTexture(ctx as never, { name: 'atlas', allowExisting: true });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.id, 'tex_a');
    assert.equal(res.value.created, false);
  }
  assert.equal(getRenderCalls(), 0);
  assert.equal(getImportCalls(), 0);
}

{
  const { ctx } = createHarness({
    textures: [{ name: 'atlas' }]
  });
  const res = runCreateBlankTexture(ctx as never, { name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(normalizeMessage(res.error.message), normalizeMessage(TEXTURE_ALREADY_EXISTS('atlas')));
  }
}

{
  const { ctx } = createHarness();
  const res = runCreateBlankTexture(ctx as never, { name: 'atlas', width: 64, height: 64 });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(normalizeMessage(res.error.message), normalizeMessage(TEXTURE_PAINT_SIZE_EXCEEDS_MAX(32)));
    assert.ok(typeof res.error.fix === 'string');
  }
}

{
  const { ctx, getCapturedData, getImportCalls, getRenderCalls } = createHarness();
  const res = runCreateBlankTexture(ctx as never, {
    name: 'atlas',
    width: 2,
    height: 2,
    background: '#112233'
  });
  assert.equal(res.ok, true);
  assert.equal(getRenderCalls(), 1);
  assert.equal(getImportCalls(), 1);
  const data = getCapturedData();
  assert.ok(data);
  if (data) {
    assert.equal(data[0], 0x11);
    assert.equal(data[1], 0x22);
    assert.equal(data[2], 0x33);
    assert.equal(data[3], 0xff);
  }
}

{
  const { ctx } = createHarness({ renderWithoutResult: true });
  const res = runCreateBlankTexture(ctx as never, { name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(normalizeMessage(res.error.message), normalizeMessage(TEXTURE_RENDERER_NO_IMAGE));
}

{
  const { ctx } = createHarness({ importError: { code: 'invalid_state', message: 'import failed' } });
  const res = runCreateBlankTexture(ctx as never, { name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(normalizeMessage(res.error.message), 'import failed');
}
