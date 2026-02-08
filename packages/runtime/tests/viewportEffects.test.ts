import assert from 'node:assert/strict';

import { TOOL_NAMES } from '../src/shared/toolConstants';
import {
  TOOL_VIEWPORT_EFFECTS,
  VIEWPORT_EFFECTS,
  getViewportEffectForTool
} from '../src/shared/tooling/viewportEffects';

{
  const allowedEffects = new Set<string>(VIEWPORT_EFFECTS);
  assert.equal(Object.keys(TOOL_VIEWPORT_EFFECTS).length, TOOL_NAMES.length);
  TOOL_NAMES.forEach((tool) => {
    const effect = TOOL_VIEWPORT_EFFECTS[tool];
    assert.equal(getViewportEffectForTool(tool), effect);
    assert.equal(allowedEffects.has(effect), true);
  });
}

{
  assert.equal(getViewportEffectForTool('list_capabilities') === 'none', true);
  assert.equal(getViewportEffectForTool('update_cube') !== 'none', true);
  assert.equal(getViewportEffectForTool('set_frame_pose') !== 'none', true);
}
