import assert from 'node:assert/strict';

import type { ToolError, Capabilities } from '../src/types';
import { ProjectSession } from '../src/session';
import { ProjectLifecycleService } from '../src/usecases/project/ProjectLifecycleService';
import type { ProjectServiceDeps } from '../src/usecases/project/projectServiceTypes';
import {
  PROJECT_CREATE_REQUIREMENTS,
  PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX,
  PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX,
  PROJECT_MATCH_FORMAT_REQUIRED,
  PROJECT_MATCH_NAME_REQUIRED,
  PROJECT_MISMATCH,
  PROJECT_NO_ACTIVE,
  PROJECT_UV_PIXELS_PER_BLOCK_INVALID
} from '../src/shared/messages';
import { createEditorStub, createFormatPortStub } from './fakes';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  formats: [{ format: 'geckolib', animations: true, enabled: true }],
  limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
};

type ServiceHarness = {
  service: ProjectLifecycleService;
  uvCalls: number[];
  createdTextures: string[];
};

const createHarness = (options?: {
  active?: boolean;
  setUvError?: ToolError | null;
  autoCreateProjectTexture?: boolean;
}) : ServiceHarness => {
  const session = new ProjectSession();
  if (options?.active) {
    const created = session.create('geckolib', 'active', 'geckolib_model');
    assert.equal(created.ok, true);
  }

  const uvCalls: number[] = [];
  const createdTextures: string[] = [];
  const baseEditor = createEditorStub();
  const editor: ProjectServiceDeps['editor'] = {
    ...baseEditor,
    setProjectUvPixelsPerBlock: (value: number) => {
      uvCalls.push(value);
      return options?.setUvError ?? null;
    }
  };

  const deps: ProjectServiceDeps = {
    session,
    capabilities,
    editor,
    formats: createFormatPortStub('geckolib_model', 'GeckoLib'),
    projectState: {
      normalize: (snapshot) => snapshot,
      toProjectInfo: (snapshot) => {
        const hasData =
          snapshot.id ||
          snapshot.format ||
          snapshot.name ||
          snapshot.bones.length > 0 ||
          snapshot.cubes.length > 0 ||
          snapshot.textures.length > 0 ||
          snapshot.animations.length > 0;
        if (!hasData) return null;
        return {
          id: snapshot.id ?? 'active',
          name: snapshot.name ?? null,
          format: snapshot.format ?? null,
          formatId: snapshot.formatId ?? null
        };
      },
      buildProjectState: () => {
        throw new Error('not used in test');
      },
      matchOverrideKind: () => null
    },
    revision: {
      track: () => 'r1',
      hash: () => 'h1',
      get: () => null,
      remember: () => undefined
    },
    getSnapshot: () => session.snapshot(),
    ensureRevisionMatch: () => null,
    texture: {
      createBlankTexture: ({ name }) => {
        createdTextures.push(name);
        return { ok: true, value: { id: 'tex1', name, created: true } };
      }
    },
    policies: {
      autoCreateProjectTexture: options?.autoCreateProjectTexture ?? false
    }
  };

  return {
    service: new ProjectLifecycleService(deps),
    uvCalls,
    createdTextures
  };
};

{
  const { service } = createHarness();
  const res = service.ensureProject({ onMissing: 'error' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, PROJECT_NO_ACTIVE);
  }
}

{
  const { service } = createHarness();
  const res = service.ensureProject({ match: 'format' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_MATCH_FORMAT_REQUIRED);
  }
}

{
  const { service } = createHarness();
  const res = service.ensureProject({ match: 'format_and_name', format: 'geckolib' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_MATCH_NAME_REQUIRED);
  }
}

{
  const { service } = createHarness();
  const res = service.ensureProject({ onMissing: 'create' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_CREATE_REQUIREMENTS);
    assert.equal(res.error.fix, PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX);
  }
}

{
  const { service } = createHarness();
  const res = service.ensureProject({
    onMissing: 'create',
    format: 'geckolib',
    name: 'demo',
    uvPixelsPerBlock: 0
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_UV_PIXELS_PER_BLOCK_INVALID);
  }
}

{
  const { service, uvCalls, createdTextures } = createHarness({ autoCreateProjectTexture: true });
  const res = service.ensureProject({
    onMissing: 'create',
    format: 'geckolib',
    name: 'dragon',
    uvPixelsPerBlock: 32
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.action, 'created');
    assert.equal(res.value.project.name, 'dragon');
  }
  assert.deepEqual(uvCalls, [32]);
  assert.deepEqual(createdTextures, ['dragon']);
}

{
  const { service } = createHarness({ active: true });
  const res = service.ensureProject({
    match: 'name',
    name: 'other',
    onMismatch: 'error'
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, PROJECT_MISMATCH);
  }
}

{
  const { service } = createHarness({ active: true });
  const res = service.ensureProject({
    match: 'name',
    name: 'other',
    onMismatch: 'create'
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_CREATE_REQUIREMENTS);
    assert.equal(res.error.fix, PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX);
  }
}

{
  const { service, uvCalls } = createHarness({ active: true });
  const res = service.ensureProject({
    match: 'name',
    name: 'other',
    onMismatch: 'reuse',
    uvPixelsPerBlock: 24
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.action, 'reused');
  }
  assert.deepEqual(uvCalls, [24]);
}

{
  const { service } = createHarness();
  const res = service.createProject('geckolib', 'demo', { uvPixelsPerBlock: 0 });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_UV_PIXELS_PER_BLOCK_INVALID);
  }
}
