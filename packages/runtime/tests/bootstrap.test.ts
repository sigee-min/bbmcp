import assert from 'node:assert/strict';

import { buildDefaultToolService } from '../src/dispatcher/bootstrap';
import { ProjectSession } from '../src/session';
import type { Capabilities } from '/contracts/types/internal';
import { ToolService } from '../src/usecases/ToolService';
import { noopLog } from './helpers';

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: 'test',
  authoring: { animations: true, enabled: true  },
  limits: { maxCubes: 32, maxTextureSize: 64, maxAnimationSeconds: 8 }
};

{
  const session = new ProjectSession();
  const service = buildDefaultToolService(session, capabilities, noopLog);
  assert.equal(service instanceof ToolService, true);
  assert.deepEqual(service.listCapabilities(), capabilities);
}

{
  const session = new ProjectSession();
  const service = buildDefaultToolService(session, capabilities, noopLog);
  const result = service.getProjectState({ detail: 'summary' });
  assert.equal(result.ok, true);
}
