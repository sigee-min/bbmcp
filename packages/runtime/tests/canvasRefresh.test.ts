import assert from 'node:assert/strict';

import { invalidateCanvas } from '../src/adapters/blockbench/viewport/canvasRefresh';
import type { BlockbenchCanvasApi } from '../src/types/blockbench';

{
  assert.equal(invalidateCanvas(undefined, 'geometry'), false);
}

{
  const calls: string[] = [];
  const canvas: BlockbenchCanvasApi = {
    updateView: () => {
      calls.push('updateView');
    },
    updateAllPositions: () => {
      calls.push('updateAllPositions');
    }
  };
  const ok = invalidateCanvas(canvas, 'geometry');
  assert.equal(ok, true);
  assert.deepEqual(calls, ['updateView']);
}

{
  const calls: string[] = [];
  const canvas: BlockbenchCanvasApi = {
    updateAllBones: () => {
      calls.push('updateAllBones');
    },
    updateAll: () => {
      calls.push('updateAll');
    }
  };
  const ok = invalidateCanvas(canvas, 'animation');
  assert.equal(ok, true);
  assert.deepEqual(calls, ['updateAllBones']);
}

{
  const calls: string[] = [];
  const canvas: BlockbenchCanvasApi = {
    updateAll: () => {
      calls.push('updateAll');
    }
  };
  const ok = invalidateCanvas(canvas, 'texture');
  assert.equal(ok, true);
  assert.deepEqual(calls, ['updateAll']);
}

{
  const canvas: BlockbenchCanvasApi = {
    updateAll: () => undefined,
    updateView: () => undefined
  };
  assert.equal(invalidateCanvas(canvas, 'none'), false);
}
