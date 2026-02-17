import assert from 'node:assert/strict';

import type { EditorPort } from '../src/ports/editor';
import type { ToolError } from '/contracts/types/internal';
import { ProjectSession } from '../src/session';
import { TextureAssignmentService } from '../src/usecases/textureService/TextureAssignmentService';

type SetupOptions = {
  ensureActiveError?: ToolError | null;
  ensureRevisionError?: ToolError | null;
  editorAssignError?: ToolError | null;
};

const createServiceSetup = (options: SetupOptions = {}) => {
  const session = new ProjectSession();
  session.create('demo', 'geckolib_model');
  session.addBone({ name: 'root', pivot: [0, 0, 0] });
  session.addCube({ id: 'cube1', name: 'body', bone: 'root', from: [0, 0, 0], to: [8, 8, 8] });
  session.addCube({ id: 'cube2', name: 'body', bone: 'root', from: [1, 1, 1], to: [4, 4, 4] });
  session.addTexture({ id: 'tex1', name: 'atlas', width: 16, height: 16 });

  const calls: Array<Parameters<EditorPort['assignTexture']>[0]> = [];
  const editor = {
    assignTexture: (payload) => {
      calls.push(payload);
      return options.editorAssignError ?? null;
    }
  } as never;

  const service = new TextureAssignmentService({
    editor,
    getSnapshot: () => session.snapshot(),
    ensureActive: () => options.ensureActiveError ?? null,
    ensureRevisionMatch: () => options.ensureRevisionError ?? null
  });

  return { service, calls };
};

// ensureActive errors should short-circuit before assignment.
{
  const { service, calls } = createServiceSetup({
    ensureActiveError: { code: 'invalid_state', message: 'inactive' }
  });
  const res = service.assignTexture({
    textureName: 'atlas',
    cubeNames: ['body']
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_state');
  assert.equal(calls.length, 0);
}

// missing texture selector should fail.
{
  const { service } = createServiceSetup();
  const res = service.assignTexture({
    cubeNames: ['body']
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// unknown cube targets should fail with invalid_payload.
{
  const { service } = createServiceSetup();
  const res = service.assignTexture({
    textureName: 'atlas',
    cubeNames: ['missing']
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

// invalid face list should fail before editor call.
{
  const { service, calls } = createServiceSetup();
  const res = service.assignTexture({
    textureName: 'atlas',
    cubeNames: ['body'],
    faces: ['north', 'invalid_face' as 'north']
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
  assert.equal(calls.length, 0);
}

// editor assignment failures should propagate.
{
  const { service } = createServiceSetup({
    editorAssignError: { code: 'unknown', message: 'assign failed' }
  });
  const res = service.assignTexture({
    textureName: 'atlas',
    cubeNames: ['body']
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message.startsWith('assign failed'), true);
}

// valid assignment should dedupe faces and return selected cube count.
{
  const { service, calls } = createServiceSetup();
  const res = service.assignTexture({
    textureName: 'atlas',
    cubeNames: ['body'],
    faces: ['north', 'north', 'south']
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.textureName, 'atlas');
    assert.equal(res.value.cubeCount, 2);
    assert.deepEqual(res.value.faces, ['north', 'south']);
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].cubeIds?.sort(), ['cube1', 'cube2']);
  assert.deepEqual(calls[0].cubeNames, ['body']);
  assert.deepEqual(calls[0].faces, ['north', 'south']);
}
