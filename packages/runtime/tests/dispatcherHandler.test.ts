import assert from 'node:assert/strict';

import { ToolDispatcherImpl } from '../src/dispatcher';
import type { ToolPayloadMap, ToolResultMap } from '../src/types';
import { ok, registerAsync, unsafePayload } from './helpers';

const createDispatcher = () => {
  const service = {
    listCapabilities: () => ({ tools: [], limits: { maxCubes: 1, maxTextureSize: 16, maxAnimationSeconds: 10 } }),
    getProjectState: (_payload: unknown) =>
      ok({
        project: {
          id: 'p',
          active: true,
          name: null,
          format: null,
          revision: 'r1',
          counts: { bones: 0, cubes: 0, textures: 0, animations: 0 }
        }
      }),
    getProjectDiff: (_payload: unknown) => ok({ diff: { sinceRevision: 'r0', currentRevision: 'r1', counts: {} } }),
    reloadPlugins: (_payload: unknown) => ok({ ok: true }),
    renderPreview: (_payload: unknown) => ok({ kind: 'single', frameCount: 1, images: [] }),
    validate: (_payload: unknown) => ok({ findings: [] }),
    exportModel: (_payload: unknown) => ok({ path: 'out' }),
    notifyViewportRefresh: (_tool: unknown) => undefined
  };
  const session = unsafePayload({});
  const capabilities = unsafePayload(service.listCapabilities());
  return new ToolDispatcherImpl(unsafePayload(session), unsafePayload(capabilities), unsafePayload(service), {
    includeStateByDefault: false
  });
};

// response handler path
{
  registerAsync((async () => {
    const dispatcher = createDispatcher();
    const res = await dispatcher.handle('get_project_state', { detail: 'summary' } as ToolPayloadMap['get_project_state']);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok((res.data as ToolResultMap['get_project_state']).project);
    }
  })());
}

