import assert from 'node:assert/strict';

import type { Capabilities, PaintMeshFacePayload } from '../src/types';
import { DEFAULT_UV_POLICY } from '../src/domain/uv/policy';
import { ProjectSession } from '../src/session';
import { TEXTURE_MESH_FACE_UNSUPPORTED_FORMAT } from '../src/shared/messages';
import { TextureService } from '../src/usecases/TextureService';
import { createEditorStub } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [
    {
      format: 'Java Block/Item',
      animations: false,
      enabled: true,
      flags: { meshes: false }
    }
  ],
  limits: { maxCubes: 256, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

const payload: PaintMeshFacePayload = {
  textureName: 'atlas',
  target: { meshName: 'wing', faceId: 'f0' },
  op: { op: 'fill_rect', x: 0, y: 0, width: 2, height: 2, color: '#336699' }
};

{
  const session = new ProjectSession();
  session.create('Java Block/Item', 'demo');
  const service = new TextureService({
    session,
    editor: createEditorStub(),
    capabilities,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => null,
    ensureRevisionMatch: () => null,
    getUvPolicyConfig: () => DEFAULT_UV_POLICY
  });

  const res = service.paintMeshFace(payload);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, TEXTURE_MESH_FACE_UNSUPPORTED_FORMAT);
  }
}
