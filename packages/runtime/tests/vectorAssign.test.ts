import assert from 'node:assert/strict';

import { assignVec2, assignVec3 } from '../src/adapters/blockbench/utils/vectors';

// Keep x/y/z assignment stable even if an incompatible `set` function exists.
{
  let setCalled = 0;
  const target: Record<string, unknown> = {
    from: {
      x: 6,
      y: 6,
      z: -7,
      set: () => {
        setCalled += 1;
      }
    }
  };
  assignVec3(target, 'from', [-4, 6, -7]);
  const next = target.from as { x: number; y: number; z: number };
  assert.equal(next.x, -4);
  assert.equal(next.y, 6);
  assert.equal(next.z, -7);
  assert.equal(setCalled, 0);
}

// Fallback to set(x, y, z) when numeric x/y/z fields are unavailable.
{
  let captured: [number, number, number] | null = null;
  const target: Record<string, unknown> = {
    origin: {
      set: (x: number, y: number, z: number) => {
        captured = [x, y, z];
      }
    }
  };
  assignVec3(target, 'origin', [1, 2, 3]);
  assert.deepEqual(captured, [1, 2, 3]);
}

// Keep x/y assignment stable even if an incompatible `set` function exists.
{
  let setCalled = 0;
  const target: Record<string, unknown> = {
    uv_offset: {
      x: 9,
      y: 10,
      set: () => {
        setCalled += 1;
      }
    }
  };
  assignVec2(target, 'uv_offset', [2, 4]);
  const next = target.uv_offset as { x: number; y: number };
  assert.equal(next.x, 2);
  assert.equal(next.y, 4);
  assert.equal(setCalled, 0);
}
