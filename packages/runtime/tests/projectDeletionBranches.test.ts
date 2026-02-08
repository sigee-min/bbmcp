import assert from 'node:assert/strict';

import { runDeleteProject, type ProjectDeleteContext } from '../src/usecases/project/projectDeletion';
import {
  PROJECT_DELETE_NAME_REQUIRED,
  PROJECT_MISMATCH,
  PROJECT_NO_ACTIVE
} from '../src/shared/messages';

type Snapshot = {
  id: string | null;
  format: 'geckolib' | null;
  formatId?: string | null;
  name: string | null;
};

const activeSnapshot: Snapshot = {
  id: 'p1',
  format: 'geckolib',
  formatId: 'geckolib_model',
  name: 'dragon'
};

const createContext = (options?: {
  revisionError?: { code: 'invalid_state'; message: string } | null;
  snapshot?: Snapshot;
  closeError?: { code: 'io_error'; message: string } | null;
}) => {
  let resetCount = 0;
  const ctx = {
    ensureRevisionMatch: () => options?.revisionError ?? null,
    getSnapshot: () => options?.snapshot ?? activeSnapshot,
    editor: {
      closeProject: () => options?.closeError ?? null
    },
    session: {
      reset: () => {
        resetCount += 1;
      }
    },
    projectState: {
      normalize: (snapshot: Snapshot) => snapshot,
      toProjectInfo: (snapshot: Snapshot) =>
        snapshot.id && snapshot.format
          ? {
              id: snapshot.id,
              name: snapshot.name,
              format: snapshot.format,
              formatId: snapshot.formatId ?? null
            }
          : null
    }
  } as unknown as ProjectDeleteContext;
  return { ctx, resetCount: () => resetCount };
};

{
  const { ctx } = createContext({
    revisionError: { code: 'invalid_state', message: 'revision mismatch' }
  });
  const res = runDeleteProject(ctx, { target: { name: 'dragon' }, ifRevision: 'r0' });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
}

{
  const { ctx } = createContext();
  const res = runDeleteProject(ctx, {});
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
    assert.equal(res.error.message, PROJECT_DELETE_NAME_REQUIRED);
  }
}

{
  const { ctx } = createContext();
  const res = runDeleteProject(ctx, { target: { name: ' ' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

{
  const { ctx } = createContext({
    snapshot: {
      id: null,
      format: null,
      formatId: null,
      name: null
    }
  });
  const res = runDeleteProject(ctx, { target: { name: 'dragon' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, PROJECT_NO_ACTIVE);
  }
}

{
  const { ctx } = createContext();
  const res = runDeleteProject(ctx, { target: { name: 'other' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, PROJECT_MISMATCH);
    assert.deepEqual(res.error.details, {
      expected: { name: 'other' },
      actual: { name: 'dragon' }
    });
  }
}

{
  const { ctx, resetCount } = createContext({
    closeError: { code: 'io_error', message: 'close failed' }
  });
  const res = runDeleteProject(ctx, { target: { name: 'dragon' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'io_error');
  }
  assert.equal(resetCount(), 0);
}
