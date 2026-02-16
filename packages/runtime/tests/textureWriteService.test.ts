import assert from 'node:assert/strict';

import { hashCanvasImage } from '../src/shared/textureData';
import type { EditorPort, TextureStat } from '../src/ports/editor';
import type { ToolError } from '../src/types';
import { ProjectSession } from '../src/session';
import { TextureWriteService } from '../src/usecases/textureService/TextureWriteService';
import { createMockImage } from './fakes';

type SetupOptions = {
  ensureActiveError?: ToolError | null;
  ensureRevisionError?: ToolError | null;
  editorImportError?: ToolError | null;
  editorUpdateError?: ToolError | null;
  editorDeleteError?: ToolError | null;
};

const createServiceSetup = (options: SetupOptions = {}) => {
  const session = new ProjectSession();
  session.create('demo', 'geckolib_model');

  const textures: TextureStat[] = [
    { id: 'tex1', name: 'atlas', width: 16, height: 16 },
    { id: 'tex2', name: 'mask', width: 8, height: 8 }
  ];
  const imageA = createMockImage('data:image/png;base64,AAAA');
  const imageB = createMockImage('data:image/png;base64,BBBB');
  session.addTexture({
    id: 'tex1',
    name: 'atlas',
    width: 16,
    height: 16,
    contentHash: hashCanvasImage(imageA) ?? undefined
  });
  session.addTexture({
    id: 'tex2',
    name: 'mask',
    width: 8,
    height: 8,
    contentHash: hashCanvasImage(imageB) ?? undefined
  });

  const editor = {
    importTexture: (params) => {
      if (options.editorImportError) return options.editorImportError;
      textures.push({ id: params.id ?? null, name: params.name, width: params.width ?? 16, height: params.height ?? 16 });
      return null;
    },
    updateTexture: (params) => {
      if (options.editorUpdateError) return options.editorUpdateError;
      const idx = textures.findIndex((entry) => (params.id && entry.id === params.id) || (params.name && entry.name === params.name));
      if (idx >= 0) {
        textures[idx] = {
          ...textures[idx],
          id: params.id ?? textures[idx].id,
          name: params.newName ?? textures[idx].name,
          width: params.width ?? textures[idx].width,
          height: params.height ?? textures[idx].height
        };
      }
      return null;
    },
    deleteTexture: (params) => {
      if (options.editorDeleteError) return options.editorDeleteError;
      const idx = textures.findIndex((entry) => (params.id && entry.id === params.id) || (params.name && entry.name === params.name));
      if (idx >= 0) textures.splice(idx, 1);
      return null;
    },
    listTextures: () => textures
  } as never;

  const service = new TextureWriteService({
    session,
    editor,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => options.ensureActiveError ?? null,
    ensureRevisionMatch: () => options.ensureRevisionError ?? null
  });

  return { service, session, imageA, imageB };
};

// importTexture should require a non-empty name.
{
  const { service, imageA } = createServiceSetup();
  const res = service.importTexture({ name: '', image: imageA });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// importTexture should reject duplicate texture names.
{
  const { service, imageA } = createServiceSetup();
  const res = service.importTexture({ name: 'atlas', image: imageA });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// importTexture should reject duplicate IDs.
{
  const { service, imageA } = createServiceSetup();
  const res = service.importTexture({ id: 'tex1', name: 'new_atlas', image: imageA });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// importTexture should persist metadata and resolved size on success.
{
  const { service, session } = createServiceSetup();
  const image = createMockImage('data:image/png;base64,CCCC');
  const res = service.importTexture({
    id: 'tex3',
    name: 'overlay',
    image,
    width: 32,
    height: 16,
    namespace: 'minecraft'
  });
  assert.equal(res.ok, true);
  const snapshot = session.snapshot();
  const entry = snapshot.textures.find((texture) => texture.name === 'overlay');
  assert.ok(entry);
  assert.equal(entry?.width, 32);
  assert.equal(entry?.namespace, 'minecraft');
}

// updateTexture should require id or name.
{
  const { service, imageA } = createServiceSetup();
  const res = service.updateTexture({ image: imageA });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// updateTexture should return no_change for identical content without renaming.
{
  const { service, imageA } = createServiceSetup();
  const res = service.updateTexture({ name: 'atlas', image: imageA, width: 16, height: 16 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'no_change');
}

// updateTexture should allow renaming even when content hash is unchanged.
{
  const { service, session, imageA } = createServiceSetup();
  const res = service.updateTexture({ name: 'atlas', newName: 'atlas_renamed', image: imageA });
  assert.equal(res.ok, true);
  const renamed = session.snapshot().textures.find((texture) => texture.name === 'atlas_renamed');
  assert.ok(renamed);
}

// updateTexture should propagate editor errors.
{
  const { service, imageB } = createServiceSetup({
    editorUpdateError: { code: 'unknown', message: 'editor failed' }
  });
  const res = service.updateTexture({ name: 'atlas', image: imageB });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('editor failed'), true);
}

// deleteTexture should reject missing selector payload.
{
  const { service } = createServiceSetup();
  const res = service.deleteTexture({});
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// deleteTexture should reject blank selector values.
{
  const { service } = createServiceSetup();
  const res = service.deleteTexture({ id: '   ' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// deleteTexture should remove snapshot entries on success.
{
  const { service, session } = createServiceSetup();
  const res = service.deleteTexture({ name: 'mask' });
  assert.equal(res.ok, true);
  const snapshot = session.snapshot();
  assert.equal(snapshot.textures.some((texture) => texture.name === 'mask'), false);
}

// deleteTexture should propagate editor failures.
{
  const { service } = createServiceSetup({
    editorDeleteError: { code: 'unknown', message: 'delete failed' }
  });
  const res = service.deleteTexture({ name: 'atlas' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('delete failed'), true);
}
