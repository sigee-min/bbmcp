import assert from 'node:assert/strict';

import { ADAPTER_PROJECT_CLOSE_NOT_APPLIED } from '../src/shared/messages';
import { runDeleteProject, type ProjectDeleteContext } from '../src/usecases/project/projectDeletion';

type Snapshot = {
  id: string | null;
  format: 'entity_rig' | null;
  formatId?: string | null;
  name: string | null;
};

const activeSnapshot: Snapshot = {
  id: 'p1',
  format: 'entity_rig',
  formatId: 'geckolib_model',
  name: 'dragon'
};

const closedSnapshot: Snapshot = {
  id: null,
  format: null,
  formatId: null,
  name: null
};

const buildContext = (options?: {
  applyClose?: boolean;
  closeError?: { code: 'invalid_state'; message: string };
}): { ctx: ProjectDeleteContext; resetCalls: () => number; closeCalls: () => number } => {
  let resetCount = 0;
  let closeCount = 0;
  let active = true;
  const ctx = {
    ensureRevisionMatch: () => null,
    getSnapshot: () => (active ? activeSnapshot : closedSnapshot),
    editor: {
      closeProject: () => {
        closeCount += 1;
        if (options?.closeError) return options.closeError;
        if (options?.applyClose !== false) active = false;
        return null;
      }
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
  } as never;
  return {
    ctx,
    resetCalls: () => resetCount,
    closeCalls: () => closeCount
  };
};

{
  const { ctx, resetCalls, closeCalls } = buildContext();
  const res = runDeleteProject(ctx, { target: { name: 'dragon' } });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.action, 'deleted');
    assert.equal(res.value.project.id, 'p1');
    assert.equal(res.value.project.name, 'dragon');
  }
  assert.equal(closeCalls(), 1);
  assert.equal(resetCalls(), 1);
}

{
  const { ctx, resetCalls, closeCalls } = buildContext({ applyClose: false });
  const res = runDeleteProject(ctx, { target: { name: 'dragon' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_state');
    assert.equal(res.error.message, ADAPTER_PROJECT_CLOSE_NOT_APPLIED);
  }
  assert.equal(closeCalls(), 1);
  assert.equal(resetCalls(), 0);
}

{
  const closeError = { code: 'invalid_state' as const, message: 'close unsupported' };
  const { ctx, resetCalls, closeCalls } = buildContext({ closeError });
  const res = runDeleteProject(ctx, { target: { name: 'dragon' } });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, closeError.code);
    assert.ok(res.error.message.startsWith(closeError.message));
  }
  assert.equal(closeCalls(), 1);
  assert.equal(resetCalls(), 0);
}
