import assert from 'node:assert/strict';

import type { SessionState } from '../src/session/types';
import { SnapshotContext } from '../src/usecases/SnapshotContext';

const baseState: SessionState = {
  id: 'p1',
  format: 'geckolib',
  formatId: 'geckolib_model',
  name: 'demo',
  dirty: false,
  bones: [],
  cubes: [],
  textures: [],
  animations: [],
  animationsStatus: 'available',
  animationTimePolicy: { fps: 20, quantize: 1e-6 }
};

type SessionStub = {
  snapshot: () => SessionState;
  ensureActive: () => { code: string; message: string } | null;
  attach: (snapshot: SessionState) => { ok: true } | { ok: false; error: { code: string; message: string } };
};

const createContext = (params: {
  session: SessionStub;
  readLive?: () => SessionState | null;
  policy?: 'session' | 'live' | 'hybrid';
  autoAttach?: boolean;
  hasProjectInfo?: boolean;
}) =>
  new SnapshotContext({
    session: params.session as never,
    snapshotPort: { readSnapshot: () => (params.readLive ? params.readLive() : null) } as never,
    projectState: {
      normalize: (snapshot: SessionState) => snapshot,
      toProjectInfo: (snapshot: SessionState) =>
        params.hasProjectInfo === false ? null : snapshot.id ? { id: snapshot.id, name: snapshot.name } : null
    } as never,
    policyContext: {
      getSnapshotPolicy: () => params.policy ?? 'hybrid',
      getAutoAttachActiveProject: () => params.autoAttach ?? false
    } as never
  });

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => null,
    attach: () => ({ ok: true })
  };
  const ctx = createContext({ session, policy: 'session' });
  assert.deepEqual(ctx.getSnapshot(), baseState);
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => null,
    attach: () => ({ ok: true })
  };
  const ctx = createContext({ session, policy: 'live', readLive: () => null });
  assert.deepEqual(ctx.getSnapshot(), baseState);
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => null,
    attach: () => ({ ok: true })
  };
  const live = { ...baseState, name: 'live', animationTimePolicy: { fps: 1, quantize: 1 } };
  const ctx = createContext({ session, policy: 'live', readLive: () => live });
  const snapshot = ctx.getSnapshot();
  assert.equal(snapshot.name, 'live');
  assert.deepEqual(snapshot.animationTimePolicy, baseState.animationTimePolicy);
}

{
  const session: SessionStub = {
    snapshot: () => ({ ...baseState, id: null, format: null, name: null }),
    ensureActive: () => null,
    attach: () => ({ ok: true })
  };
  const live = { ...baseState, name: 'hybrid-live' };
  const ctx = createContext({ session, policy: 'hybrid', readLive: () => live });
  const snapshot = ctx.getSnapshot();
  assert.equal(snapshot.name, 'hybrid-live');
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => null,
    attach: () => ({ ok: true })
  };
  const ctx = createContext({ session });
  assert.equal(ctx.ensureActive(), null);
}

{
  const stateError = { code: 'invalid_state', message: 'inactive' };
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => stateError,
    attach: () => ({ ok: true })
  };
  const ctx = createContext({ session, autoAttach: false });
  const err = ctx.ensureActive();
  assert.equal(err?.code, 'invalid_state');
  assert.ok(String(err?.fix).includes('ensure_project'));
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => ({ code: 'invalid_state', message: 'inactive' }),
    attach: () => ({ ok: true })
  };
  const ctx = createContext({ session, autoAttach: true, readLive: () => null });
  const err = ctx.ensureActive();
  assert.equal(err?.code, 'invalid_state');
  assert.ok(String(err?.fix).includes('ensure_project'));
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => ({ code: 'invalid_state', message: 'inactive' }),
    attach: () => ({ ok: true })
  };
  const ctx = createContext({
    session,
    autoAttach: true,
    readLive: () => ({ ...baseState, id: null, format: null, name: null }),
    hasProjectInfo: false
  });
  const err = ctx.ensureActive();
  assert.equal(err?.code, 'invalid_state');
  assert.ok(String(err?.fix).includes('ensure_project'));
}

{
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => ({ code: 'invalid_state', message: 'inactive' }),
    attach: () => ({ ok: false, error: { code: 'io_error', message: 'attach fail' } })
  };
  const ctx = createContext({ session, autoAttach: true, readLive: () => ({ ...baseState, name: 'live' }) });
  const err = ctx.ensureActive();
  assert.equal(err?.code, 'io_error');
  assert.ok(String(err?.fix).includes('get_project_state'));
}

{
  const attached: SessionState[] = [];
  const session: SessionStub = {
    snapshot: () => baseState,
    ensureActive: () => ({ code: 'invalid_state', message: 'inactive' }),
    attach: (snapshot: SessionState) => {
      attached.push(snapshot);
      return { ok: true };
    }
  };
  const ctx = createContext({ session, autoAttach: true, readLive: () => ({ ...baseState, name: 'live2' }) });
  const err = ctx.ensureActive();
  assert.equal(err, null);
  assert.equal(attached.length, 1);
  assert.equal(attached[0]?.name, 'live2');
}

