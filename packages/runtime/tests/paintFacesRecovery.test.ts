import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { TextureRendererPort } from '../src/ports/textureRenderer';
import type { TextureToolContext } from '../src/usecases/textureTools/context';
import { captureTextureBackup, maybeRollbackTextureLoss, type TextureBackup } from '../src/usecases/textureTools/paintFacesRecovery';

const makePixels = (width: number, height: number, opaquePixels: number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(width * height * 4);
  const count = Math.max(0, Math.min(width * height, opaquePixels));
  for (let i = 0; i < count; i += 1) {
    data[i * 4 + 3] = 255;
  }
  return data;
};

type SetupOptions = {
  readTexture?: ReturnType<EditorPort['readTexture']>;
  readPixels?: TextureRendererPort['readPixels'];
  updateTexture?: TextureToolContext['updateTexture'];
};

const createSetup = (options: SetupOptions = {}) => {
  const readTexture =
    options.readTexture ??
    ({
      result: {
        id: 'tex1',
        name: 'atlas',
        width: 16,
        height: 16,
        image: { tag: 'atlas' } as unknown as CanvasImageSource
      }
    } as ReturnType<EditorPort['readTexture']>);

  const readPixels =
    options.readPixels ??
    (() => ({
      result: {
        width: 16,
        height: 16,
        data: makePixels(16, 16, 256)
      }
    }));

  const updateTexture =
    options.updateTexture ??
    (() => ({
      ok: true,
      value: { id: 'tex1', name: 'atlas' }
    }));

  const ctx = {
    editor: {
      readTexture: () => readTexture
    } as unknown as EditorPort,
    updateTexture
  } as unknown as TextureToolContext;

  const textureRenderer = {
    readPixels
  } as TextureRendererPort;

  return { ctx, textureRenderer };
};

// captureTextureBackup should return null when texture read fails.
{
  const { ctx, textureRenderer } = createSetup({
    readTexture: { error: { code: 'unknown', message: 'read failed' } }
  });
  const backup = captureTextureBackup(ctx, textureRenderer as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.equal(backup, null);
}

// captureTextureBackup should return null when image is missing.
{
  const { ctx, textureRenderer } = createSetup({
    readTexture: { result: { id: 'tex1', name: 'atlas', width: 16, height: 16 } }
  });
  const backup = captureTextureBackup(ctx, textureRenderer as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.equal(backup, null);
}

// captureTextureBackup should reject invalid dimensions.
{
  const { ctx, textureRenderer } = createSetup({
    readTexture: {
      result: {
        id: 'tex1',
        name: 'atlas',
        width: 0,
        height: 16,
        image: {} as CanvasImageSource
      }
    }
  });
  const backup = captureTextureBackup(ctx, textureRenderer as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.equal(backup, null);
}

// captureTextureBackup should return null when renderer readPixels is unavailable.
{
  const { ctx } = createSetup();
  const backup = captureTextureBackup(ctx, {} as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.equal(backup, null);
}

// captureTextureBackup should return null when pixel read fails.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ error: { code: 'unknown', message: 'pixels failed' } })
  });
  const backup = captureTextureBackup(ctx, textureRenderer as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.equal(backup, null);
}

// captureTextureBackup should return opaque pixel counts when successful.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ result: { width: 16, height: 16, data: makePixels(16, 16, 123) } })
  });
  const backup = captureTextureBackup(ctx, textureRenderer as NonNullable<TextureToolContext['textureRenderer']>, {
    name: 'atlas'
  });
  assert.ok(backup);
  assert.equal(backup?.opaquePixels, 123);
}

const guardBackup: TextureBackup = {
  image: { tag: 'before' } as unknown as CanvasImageSource,
  width: 16,
  height: 16,
  opaquePixels: 400
};

// maybeRollbackTextureLoss should no-op when recovery was not attempted.
{
  const { ctx, textureRenderer } = createSetup();
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 0,
    backup: guardBackup
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should no-op without backup.
{
  const { ctx, textureRenderer } = createSetup();
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: null
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should no-op when current texture read fails.
{
  const { ctx, textureRenderer } = createSetup({
    readTexture: { error: { code: 'unknown', message: 'read failed' } }
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should no-op when read dimensions are invalid.
{
  const { ctx, textureRenderer } = createSetup({
    readTexture: {
      result: {
        id: 'tex1',
        name: 'atlas',
        width: 0,
        height: 16,
        image: {} as CanvasImageSource
      }
    }
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should no-op when readPixels is unavailable or fails.
{
  const { ctx } = createSetup();
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: {} as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.equal(err, null);
}

{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ error: { code: 'unknown', message: 'pixels failed' } })
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should no-op when opacity drop is not suspicious.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ result: { width: 16, height: 16, data: makePixels(16, 16, 399) } })
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.equal(err, null);
}

// maybeRollbackTextureLoss should bubble rollback update errors except no_change.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ result: { width: 16, height: 16, data: makePixels(16, 16, 8) } }),
    updateTexture: () => ({ ok: false, error: { code: 'io_error', message: 'rollback failed' } })
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { id: 'tex1', name: 'atlas' },
    ifRevision: 'r1',
    recoveryAttempts: 1,
    backup: guardBackup
  });
  assert.notEqual(err, null);
  assert.equal(err?.code, 'io_error');
}

// maybeRollbackTextureLoss should still return guard error when rollback update is no_change.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ result: { width: 16, height: 16, data: makePixels(16, 16, 8) } }),
    updateTexture: () => ({ ok: false, error: { code: 'no_change', message: 'same image' } })
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 2,
    backup: guardBackup
  });
  assert.notEqual(err, null);
  assert.equal(err?.code, 'invalid_state');
  assert.equal(err?.details?.reason, 'texture_recovery_guard');
}

// maybeRollbackTextureLoss should return guard error after successful rollback.
{
  const { ctx, textureRenderer } = createSetup({
    readPixels: () => ({ result: { width: 16, height: 16, data: makePixels(16, 16, 8) } })
  });
  const err = maybeRollbackTextureLoss({
    ctx,
    textureRenderer: textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
    texture: { name: 'atlas' },
    recoveryAttempts: 3,
    backup: guardBackup
  });
  assert.notEqual(err, null);
  assert.equal(err?.code, 'invalid_state');
  assert.equal(err?.details?.recoveryAttempts, 3);
}

