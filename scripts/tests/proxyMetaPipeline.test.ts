import assert from 'node:assert/strict';

import { createProxyPipeline } from '../../src/proxy/pipeline';
import { guardRevision, withErrorMeta, withMeta } from '../../src/proxy/meta';
import { asProxyService } from './helpers';

{
  const service = {
    getProjectState: () => ({ ok: true, value: { project: { revision: 'r2', active: true } } }),
    getProjectDiff: () => ({ ok: true, value: { diff: { changed: true } } }),
    isRevisionRequired: () => false,
    isAutoRetryRevisionEnabled: () => false
  };

  const meta = { includeState: true, includeDiff: true, diffDetail: 'summary' as const, ifRevision: 'r1' };
  const payload = withMeta({ ok: true }, meta, asProxyService(service));
  assert.equal(payload.revision, 'r2');
  assert.deepEqual(payload.state, { revision: 'r2', active: true });
  assert.deepEqual(payload.diff, { changed: true });

  const err = withErrorMeta({ code: 'invalid_payload', message: 'bad' }, meta, asProxyService(service));
  assert.equal(err.ok, false);
  if (!err.ok) {
    assert.equal(err.error.code, 'invalid_payload');
    assert.ok(err.error.details);
    assert.equal((err.error.details as { revision?: unknown }).revision, 'r2');
  }
}

{
  const service = {
    getProjectState: () => ({ ok: true, value: { project: { revision: 'r2', active: true } } }),
    getProjectDiff: () => ({ ok: true, value: { diff: { changed: true } } }),
    isRevisionRequired: () => true,
    isAutoRetryRevisionEnabled: () => false
  };

  const meta = {
    includeState: false,
    includeDiff: true,
    diffDetail: 'summary' as const,
    ifRevision: undefined as string | undefined
  };

  // Missing expected revision -> invalid_state
  const res = guardRevision(asProxyService(service), undefined, meta);
  assert.ok(res);
  assert.equal(res?.ok, false);
  if (res && !res.ok) {
    assert.equal(res.error.code, 'invalid_state');
  }
}

{
  const service = {
    getProjectState: () => ({ ok: true, value: { project: { revision: 'r2', active: true } } }),
    isRevisionRequired: () => true,
    isAutoRetryRevisionEnabled: () => true
  };
  const meta = { includeState: false, includeDiff: false, diffDetail: 'summary' as const, ifRevision: 'r1' };
  const res = guardRevision(asProxyService(service), 'r1', meta);
  assert.equal(res, null);
  assert.equal(meta.ifRevision, 'r2');
}

{
  const pipeline = createProxyPipeline({
    service: asProxyService({
      getProjectState: () => ({ ok: true, value: { project: { revision: 'r9', active: true } } })
    }),
    payload: { includeState: true, includeDiff: false, diffDetail: 'summary' as const },
    includeStateByDefault: () => false,
    includeDiffByDefault: () => false,
    runWithoutRevisionGuard: async (fn) => await fn()
  });

  assert.deepEqual(pipeline.meta, {
    includeState: true,
    includeDiff: false,
    diffDetail: 'summary',
    ifRevision: undefined
  });

  const ok = pipeline.ok({ a: 1 });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.a, 1);
    assert.equal((ok.data as { revision?: unknown }).revision, 'r9');
  }
}
