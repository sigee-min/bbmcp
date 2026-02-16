import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import { ProjectSession } from '../src/session';
import {
  MODEL_CUBE_NOT_FOUND,
  TEXTURE_FACE_UV_BOUNDS_FIX,
  TEXTURE_FACE_UV_FACES_FIX,
  TEXTURE_FACE_UV_TARGET_FIX
} from '../src/shared/messages';
import { TextureUvService } from '../src/usecases/textureService/TextureUvService';

const normalizedMessage = (message: string): string => (message.endsWith('.') ? message : `${message}.`);

type HarnessOptions = {
  includeCube?: boolean;
  setFaceUvError?: { code: 'unknown'; message: string } | null;
  resolution?: { width: number; height: number } | null;
};

const createHarness = (options: HarnessOptions = {}) => {
  const session = new ProjectSession();
  const createRes = session.create('test');
  assert.equal(createRes.ok, true);
  session.addBone({ name: 'root', pivot: [0, 0, 0] });
  if (options.includeCube !== false) {
    session.addCube({
      id: 'cube1',
      name: 'cube',
      bone: 'root',
      from: [0, 0, 0],
      to: [8, 8, 8]
    });
  }

  const calls: Array<{ cubeName?: string; cubeId?: string }> = [];
  const editor = {
    getProjectTextureResolution: () => options.resolution ?? { width: 16, height: 16 },
    setFaceUv: (params: { cubeName?: string; cubeId?: string }) => {
      calls.push(params);
      return options.setFaceUvError ?? null;
    }
  } as never;

  const service = new TextureUvService({
    editor,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => null,
    ensureRevisionMatch: () => null
  });

  return { service, calls };
};

{
  const { service } = createHarness();
  const res = service.setFaceUv({
    faces: {
      north: [0, 0, 1, 1]
    }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.fix, TEXTURE_FACE_UV_TARGET_FIX);
  }
}

{
  const { service } = createHarness();
  const res = service.setFaceUv({
    cubeName: 'cube',
    faces: {}
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.fix, TEXTURE_FACE_UV_FACES_FIX);
  }
}

{
  const { service } = createHarness({ includeCube: false });
  const res = service.setFaceUv({
    cubeName: 'missing',
    faces: { north: [0, 0, 1, 1] }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, normalizedMessage(MODEL_CUBE_NOT_FOUND('missing')));
  }
}

{
  const { service } = createHarness();
  const res = service.setFaceUv({
    cubeName: 'cube',
    faces: {
      north: [0, 0, 64, 64]
    }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.fix, TEXTURE_FACE_UV_BOUNDS_FIX);
  }
}

{
  const { service } = createHarness({ setFaceUvError: { code: 'unknown', message: 'uv apply failed' } });
  const res = service.setFaceUv({
    cubeName: 'cube',
    faces: {
      north: [0, 0, 1, 1]
    }
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unknown');
    assert.equal(res.error.message, normalizedMessage('uv apply failed'));
  }
}

{
  const { service, calls } = createHarness();
  const res = service.setFaceUv({
    cubeName: 'cube',
    faces: {
      north: [0, 0, 1, 1],
      east: [0, 0, 8, 1]
    }
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.cubeName, 'cube');
    assert.deepEqual(res.value.faces, ['north', 'east']);
    assert.equal(res.value.warningCodes?.includes('uv_rect_small'), true);
    assert.equal(res.value.warningCodes?.includes('uv_rect_skewed'), true);
  }
  assert.equal(calls.length, 1);
}
