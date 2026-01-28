import assert from 'node:assert/strict';

import { ProxyRouter } from '../../src/proxy';
import type { ProxyTool } from '../../src/spec';
import { asDomPort, asProxyService, DEFAULT_LIMITS, noopLog, registerAsync, unsafePayload } from './helpers';

const createRouter = () => {
  const service = {
    getProjectState: (_payload: unknown) => ({ ok: true, value: { project: { revision: 'r1', counts: {} } } })
  };
  const dom = asDomPort({ createCanvas: () => null, createImage: () => null });
  return new ProxyRouter(asProxyService(service), dom, noopLog, DEFAULT_LIMITS);
};

registerAsync(
  (async () => {
    const router = createRouter();
    const res = await router.handle('unknown_tool' as ProxyTool, unsafePayload({}));
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'invalid_payload');
    }
  })()
);
