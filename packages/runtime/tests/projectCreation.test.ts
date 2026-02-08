import assert from 'node:assert/strict';

import { runCreateProject, type ProjectCreateContext } from '../src/usecases/project/projectCreation';
import {
  ADAPTER_PROJECT_UNSAVED_CHANGES,
  PROJECT_FORMAT_ID_MISSING_FIX,
  PROJECT_FORMAT_UNSUPPORTED_FIX,
  PROJECT_NAME_REQUIRED_FIX
} from '../src/shared/messages';

type CreateCtxOptions = {
  revisionError?: { code: 'invalid_state'; message: string } | null;
  formatEnabled?: boolean;
  listFormats?: Array<{ id: string; name?: string }>;
  createProjectResults?: Array<{ code: string; message: string } | null>;
  sessionCreateResult?:
    | { ok: true; data: { id: string; format: 'geckolib'; name: string } }
    | { ok: false; error: { code: string; message: string } };
  autoDiscardUnsaved?: boolean;
};

const createContext = (options: CreateCtxOptions = {}) => {
  const createResults = [...(options.createProjectResults ?? [null])];
  let createCalls = 0;
  const payloads: Array<{ confirmDiscard?: boolean; dialog?: Record<string, unknown> } | undefined> = [];
  const ctx = {
    capabilities: {
      pluginVersion: 'test',
      blockbenchVersion: 'test',
      formats: [{ format: 'geckolib', animations: true, enabled: options.formatEnabled ?? true }],
      limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
    },
    editor: {
      createProject: (
        _name: string,
        _formatId: string,
        _format: 'geckolib',
        payload?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
      ) => {
        createCalls += 1;
        payloads.push(payload);
        return createResults.shift() ?? null;
      }
    },
    formats: {
      listFormats: () => options.listFormats ?? [{ id: 'geckolib_model', name: 'GeckoLib' }],
      getActiveFormatId: () => null
    },
    session: {
      create: () =>
        options.sessionCreateResult ??
        ({
          ok: true,
          data: { id: 'p1', format: 'geckolib', name: 'dragon' }
        } as const)
    },
    ensureRevisionMatch: () => options.revisionError ?? null,
    policies: {
      formatOverrides: undefined,
      autoDiscardUnsaved: options.autoDiscardUnsaved
    }
  } as unknown as ProjectCreateContext;
  return { ctx, createCalls: () => createCalls, payloads };
};

{
  const { ctx, createCalls } = createContext({
    revisionError: { code: 'invalid_state', message: 'revision mismatch' }
  });
  const res = runCreateProject(ctx, 'geckolib', 'dragon', { ifRevision: 'r0' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext();
  const res = runCreateProject(ctx, 'geckolib', '   ');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.fix, PROJECT_NAME_REQUIRED_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({ formatEnabled: false });
  const res = runCreateProject(ctx, 'geckolib', 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.fix, PROJECT_FORMAT_UNSUPPORTED_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({ listFormats: [] });
  const res = runCreateProject(ctx, 'geckolib', 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.fix, PROJECT_FORMAT_ID_MISSING_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({
    createProjectResults: [{ code: 'io_error', message: 'create failed' }]
  });
  const res = runCreateProject(ctx, 'geckolib', 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'io_error');
  }
  assert.equal(createCalls(), 1);
}

{
  const { ctx, createCalls, payloads } = createContext({
    autoDiscardUnsaved: true,
    createProjectResults: [
      { code: 'invalid_state', message: ADAPTER_PROJECT_UNSAVED_CHANGES },
      null
    ]
  });
  const res = runCreateProject(ctx, 'geckolib', 'dragon', { confirmDiscard: false });
  assert.equal(res.ok, true);
  assert.equal(createCalls(), 2);
  assert.equal(payloads[0]?.confirmDiscard, false);
  assert.equal(payloads[1]?.confirmDiscard, true);
}

{
  const { ctx, createCalls } = createContext({
    autoDiscardUnsaved: true,
    createProjectResults: [{ code: 'invalid_state', message: ADAPTER_PROJECT_UNSAVED_CHANGES }]
  });
  const res = runCreateProject(ctx, 'geckolib', 'dragon', { confirmDiscard: true });
  assert.equal(res.ok, false);
  assert.equal(createCalls(), 1);
}

{
  const { ctx, createCalls } = createContext({
    sessionCreateResult: {
      ok: false,
      error: { code: 'invalid_state', message: 'session create failed' }
    }
  });
  const res = runCreateProject(ctx, 'geckolib', 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
  assert.equal(createCalls(), 1);
}

{
  const { ctx, createCalls, payloads } = createContext();
  const res = runCreateProject(ctx, 'geckolib', 'dragon', { dialog: { parent: 'root' } });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.name, 'dragon');
  }
  assert.equal(createCalls(), 1);
  assert.equal(payloads[0]?.dialog?.format, 'geckolib_model');
  assert.equal(payloads[0]?.dialog?.parent, 'root');
}

{
  const payloads: Array<{ confirmDiscard?: boolean; dialog?: Record<string, unknown> } | undefined> = [];
  const ctx = {
    capabilities: {
      pluginVersion: 'test',
      blockbenchVersion: 'test',
      formats: [{ format: 'Generic Model', animations: true, enabled: true }],
      limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
    },
    editor: {
      createProject: (
        _name: string,
        _formatId: string,
        _format: 'Generic Model',
        payload?: { confirmDiscard?: boolean; dialog?: Record<string, unknown> }
      ) => {
        payloads.push(payload);
        return null;
      }
    },
    formats: {
      listFormats: () => [{ id: 'free', name: 'Generic Model' }],
      getActiveFormatId: () => null
    },
    session: {
      create: () =>
        ({
          ok: true,
          data: { id: 'p2', format: 'Generic Model', name: 'agent' }
        } as const)
    },
    ensureRevisionMatch: () => null,
    policies: {
      formatOverrides: undefined,
      autoDiscardUnsaved: false
    }
  } as unknown as ProjectCreateContext;

  const res = runCreateProject(ctx, 'Generic Model', 'agent');
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.format, 'Generic Model');
  }
  assert.equal(payloads[0]?.dialog?.format, 'free');
}
