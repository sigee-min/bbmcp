import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TmpStorePort } from '../src/ports/tmpStore';
import { TMP_STORE_UNAVAILABLE } from '../src/shared/messages';
import { TextureReadService } from '../src/usecases/textureService/TextureReadService';
import { createEditorStub } from './fakes';

type HarnessOptions = {
  dataUri?: string;
  readError?: { code: 'invalid_payload'; message: string };
  tmpStore?: TmpStorePort;
};

const createHarness = (options: HarnessOptions = {}) => {
  const editor: EditorPort = {
    ...createEditorStub(),
    listTextures: () => [{ id: 'tex1', name: 'atlas', width: 16, height: 16 }],
    readTexture: () => {
      if (options.readError) return { error: options.readError };
      return {
        result: {
          id: 'tex1',
          name: 'atlas',
          width: 16,
          height: 16,
          dataUri: options.dataUri,
          image: undefined
        }
      };
    }
  };

  return new TextureReadService({
    editor,
    ensureActive: () => null,
    tmpStore: options.tmpStore
  });
};

{
  const service = createHarness({ dataUri: undefined });
  const res = service.readTextureImage({ name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'not_implemented');
}

{
  const service = createHarness({ dataUri: 'data:image/png;base64,AAAA' });
  const res = service.readTextureImage({ name: 'atlas', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'not_implemented');
    assert.equal(res.error.message.includes(TMP_STORE_UNAVAILABLE), true);
  }
}

{
  const service = createHarness({
    dataUri: 'data:image/png;base64,AAAA',
    tmpStore: {
      saveDataUri: () => ({ ok: false, error: { code: 'io_error', message: 'tmp write failed' } })
    }
  });
  const res = service.readTextureImage({ name: 'atlas', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'io_error');
    assert.equal(res.error.message.includes('tmp write failed'), true);
  }
}

{
  const service = createHarness({ dataUri: 'data:image/png;base64,AAAA' });
  const res = service.readTextureImage({ name: 'atlas' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.texture.name, 'atlas');
    assert.equal(res.value.texture.mimeType, 'image/png');
    assert.equal(typeof res.value.texture.byteLength, 'number');
    assert.equal(typeof res.value.texture.dataUri, 'string');
  }
}

{
  const service = createHarness({
    dataUri: 'data:image/png;base64,AAAA',
    tmpStore: {
      saveDataUri: () => ({
        ok: true,
        data: {
          path: 'texture_atlas.png',
          mimeType: 'image/png',
          byteLength: 4
        }
      })
    }
  });
  const res = service.readTextureImage({ name: 'atlas', saveToTmp: true, tmpPrefix: 'texture', tmpName: 'atlas' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.saved?.texture?.path, 'texture_atlas.png');
    assert.equal(res.value.saved?.texture?.byteLength, 4);
    assert.equal(res.value.saved?.texture?.mime, 'image/png');
  }
}
