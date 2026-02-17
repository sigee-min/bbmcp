import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TmpStorePort } from '../src/ports/tmpStore';
import { RenderService } from '../src/usecases/RenderService';
import {
  PREVIEW_FRAME_DATA_UNAVAILABLE,
  PREVIEW_FRAMES_UNAVAILABLE,
  PREVIEW_IMAGE_DATA_UNAVAILABLE,
  PREVIEW_UNSUPPORTED_NO_RENDER,
  TMP_STORE_UNAVAILABLE
} from '../src/shared/messages';

const normalizedMessage = (message: string): string => (message.endsWith('.') ? message : `${message}.`);

const createEditor = (
  renderPreview: EditorPort['renderPreview']
): EditorPort =>
  ({
    createProject: () => null,
    closeProject: () => null,
    importTexture: () => null,
    updateTexture: () => null,
    deleteTexture: () => null,
    readTexture: () => ({ error: { code: 'invalid_payload', message: 'unused' } }),
    assignTexture: () => null,
    setFaceUv: () => null,
    addBone: () => null,
    updateBone: () => null,
    deleteBone: () => null,
    addCube: () => null,
    updateCube: () => null,
    deleteCube: () => null,
    createAnimation: () => null,
    updateAnimation: () => null,
    deleteAnimation: () => null,
    setKeyframes: () => null,
    setTriggerKeyframes: () => null,
    renderPreview,
    writeFile: () => null,
    listTextures: () => [],
    getProjectTextureResolution: () => null,
    setProjectTextureResolution: () => null,
    setProjectUvPixelsPerBlock: () => null,
    getTextureUsage: () => ({ result: { textures: [] } })
  }) as EditorPort;

const createTmpStore = (saveDataUri: TmpStorePort['saveDataUri']): TmpStorePort => ({
  saveDataUri
});

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'single',
        frameCount: 1,
        image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 16, height: 16 }
      }
    })),
    ensureActive: () => null,
    allowRenderPreview: false
  });
  const res = service.renderPreview({ mode: 'fixed' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, normalizedMessage(PREVIEW_UNSUPPORTED_NO_RENDER));
  }
}

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'single',
        frameCount: 1,
        image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 16, height: 16 }
      }
    })),
    ensureActive: () => ({ code: 'invalid_state', message: 'inactive' })
  });
  const res = service.renderPreview({ mode: 'fixed' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
}

{
  const service = new RenderService({
    editor: createEditor(() => ({ error: { code: 'invalid_payload', message: 'preview failed' } })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('preview failed'));
}

{
  const result = {
    kind: 'single' as const,
    frameCount: 1,
    image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 16, height: 16 }
  };
  const service = new RenderService({
    editor: createEditor(() => ({ result })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed', saveToTmp: false });
  assert.equal(res.ok, true);
  if (res.ok) assert.deepEqual(res.value, result);
}

{
  const service = new RenderService({
    editor: createEditor(() => ({ result: { kind: 'single', frameCount: 1 } })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, normalizedMessage(PREVIEW_IMAGE_DATA_UNAVAILABLE));
  }
}

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'single',
        frameCount: 1,
        image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 16, height: 16 }
      }
    })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, normalizedMessage(TMP_STORE_UNAVAILABLE));
  }
}

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'single',
        frameCount: 1,
        image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 16, height: 16 }
      }
    })),
    tmpStore: createTmpStore(() => ({ ok: false, error: { code: 'io_error', message: 'tmp failed' } })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('tmp failed'));
}

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'single',
        frameCount: 1,
        image: { mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 32, height: 32 }
      }
    })),
    tmpStore: createTmpStore((_dataUri, options) => ({
      ok: true,
      data: {
        path: `${options?.prefix}_${options?.nameHint}.png`,
        mimeType: 'image/png',
        byteLength: 4
      }
    })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'fixed', saveToTmp: true, tmpPrefix: 'pv', tmpName: 'still' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.saved?.image?.path, 'pv_still.png');
    assert.equal(res.value.saved?.image?.byteLength, 4);
    assert.equal(res.value.saved?.image?.width, 32);
    assert.equal(res.value.saved?.image?.height, 32);
  }
}

{
  const service = new RenderService({
    editor: createEditor(() => ({ result: { kind: 'sequence', frameCount: 0, frames: [] } })),
    tmpStore: createTmpStore(() => ({ ok: true, data: { path: 'unused', mimeType: 'image/png', byteLength: 1 } })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'turntable', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, normalizedMessage(PREVIEW_FRAMES_UNAVAILABLE));
  }
}

{
  const service = new RenderService({
    editor: createEditor(() => ({
      result: { kind: 'sequence', frameCount: 1, frames: [{ index: 0, mime: 'image/png', dataUri: '', byteLength: 0, width: 8, height: 8 }] }
    })),
    tmpStore: createTmpStore(() => ({ ok: true, data: { path: 'unused', mimeType: 'image/png', byteLength: 1 } })),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'turntable', saveToTmp: true });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, normalizedMessage(PREVIEW_FRAME_DATA_UNAVAILABLE));
  }
}

{
  const saved: string[] = [];
  const service = new RenderService({
    editor: createEditor(() => ({
      result: {
        kind: 'sequence',
        frameCount: 2,
        frames: [
          { index: 0, mime: 'image/png', dataUri: 'data:image/png;base64,AAAA', byteLength: 1, width: 8, height: 8 },
          { index: 1, mime: 'image/png', dataUri: 'data:image/png;base64,BBBB', byteLength: 1, width: 8, height: 8 }
        ]
      }
    })),
    tmpStore: createTmpStore((dataUri, options) => {
      const path = `${options?.nameHint}.png`;
      saved.push(`${path}:${dataUri.slice(-4)}`);
      return { ok: true, data: { path, mimeType: 'image/png', byteLength: 2 } };
    }),
    ensureActive: () => null
  });
  const res = service.renderPreview({ mode: 'turntable', saveToTmp: true, tmpName: 'turn', tmpPrefix: 'pv' });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.saved?.frames?.length, 2);
    assert.equal(res.value.saved?.frames?.[0]?.path, 'turn_frame0.png');
    assert.equal(res.value.saved?.frames?.[1]?.path, 'turn_frame1.png');
  }
  assert.deepEqual(saved, ['turn_frame0.png:AAAA', 'turn_frame1.png:BBBB']);
}
