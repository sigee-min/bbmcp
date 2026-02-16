import assert from 'node:assert/strict';

import { runCreateProject, type ProjectCreateContext } from '../src/usecases/project/projectCreation';
import {
  ADAPTER_PROJECT_UNSAVED_CHANGES,
  PROJECT_AUTHORING_FORMAT_ID_MISSING_FIX,
  PROJECT_FORMAT_UNSUPPORTED_FIX,
  PROJECT_NAME_REQUIRED_FIX,
  PROJECT_UNSUPPORTED_FORMAT
} from '../src/shared/messages';

type CreateCtxOptions = {
  revisionError?: { code: 'invalid_state'; message: string } | null;
  formatEnabled?: boolean;
  listFormats?: Array<{ id: string; name?: string }>;
  createProjectResults?: Array<{ code: string; message: string } | null>;
  sessionCreateResult?:
    | { ok: true; data: { id: string; name: string } }
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
      authoring: { animations: true, enabled: options.formatEnabled ?? true  },
      limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 120 }
    },
    editor: {
      createProject: (
        _name: string,
        _formatId: string,
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
          data: { id: 'p1', name: 'dragon' }
        } as const)
    },
    ensureRevisionMatch: () => options.revisionError ?? null,
    policies: {
      formatOverrides: undefined,
      autoDiscardUnsaved: options.autoDiscardUnsaved
    }
  } as never;
  return { ctx, createCalls: () => createCalls, payloads };
};

{
  const { ctx, createCalls } = createContext({
    revisionError: { code: 'invalid_state', message: 'revision mismatch' }
  });
  const res = runCreateProject(ctx, 'dragon', { ifRevision: 'r0' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext();
  const res = runCreateProject(ctx, '   ');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.fix, PROJECT_NAME_REQUIRED_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({ formatEnabled: false });
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.fix, PROJECT_FORMAT_UNSUPPORTED_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({ listFormats: [] });
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.fix, PROJECT_AUTHORING_FORMAT_ID_MISSING_FIX);
  }
  assert.equal(createCalls(), 0);
}

{
  const { ctx, createCalls } = createContext({
    createProjectResults: [{ code: 'io_error', message: 'create failed' }]
  });
  const res = runCreateProject(ctx, 'dragon');
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
  const res = runCreateProject(ctx, 'dragon', { confirmDiscard: false });
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
  const res = runCreateProject(ctx, 'dragon', { confirmDiscard: true });
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
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
  assert.equal(createCalls(), 1);
}

{
  const { ctx, createCalls, payloads } = createContext();
  const res = runCreateProject(ctx, 'dragon', { dialog: { parent: 'root' } });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.name, 'dragon');
  }
  assert.equal(createCalls(), 1);
  assert.equal(payloads[0]?.dialog?.format, 'geckolib_model');
  assert.equal(payloads[0]?.dialog?.parent, 'root');
}

{
  const { ctx, createCalls } = createContext({
    listFormats: [{ id: 'image', name: 'Image' }]
  });
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, `${PROJECT_UNSUPPORTED_FORMAT('image')}.`);
  }
  assert.equal(createCalls(), 0);
}

// SPEC-PRO-012: unresolved effective formatId can still be selected deterministically
// when exactly one allowlist candidate exists in formats.listFormats().
{
  const { ctx, createCalls, payloads } = createContext({
    listFormats: [
      { id: 'entity_rig', name: 'Entity Rig' },
      { id: 'image', name: 'Image' }
    ]
  });
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, true);
  assert.equal(createCalls(), 1);
  assert.equal(payloads[0]?.dialog?.format, 'entity_rig');
}

// SPEC-PRO-013: if multiple allowlist candidates exist and the effective format cannot be resolved,
// the engine must reject the request (decision is ambiguous).
{
  const { ctx, createCalls } = createContext({
    listFormats: [
      { id: 'entity_rig', name: 'Entity Rig' },
      { id: 'geckolib_model', name: 'GeckoLib' }
    ]
  });
  const res = runCreateProject(ctx, 'dragon');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.fix, PROJECT_AUTHORING_FORMAT_ID_MISSING_FIX);
  }
  assert.equal(createCalls(), 0);
}
