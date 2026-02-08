import assert from 'node:assert/strict';

import { runSetKeyframes } from '../../src/adapters/blockbench/animation/animationCommands';
import { noopLog } from './helpers';

const withGlobals = (overrides: Record<string, unknown>, fn: () => void) => {
  const globals = globalThis as Record<string, unknown>;
  const previous = Object.entries(overrides).map(([key, value]) => ({
    key,
    exists: Object.prototype.hasOwnProperty.call(globals, key),
    value: globals[key],
    next: value
  }));
  for (const entry of previous) {
    if (entry.next === undefined) delete globals[entry.key];
    else globals[entry.key] = entry.next;
  }
  try {
    fn();
  } finally {
    for (const entry of previous) {
      if (entry.exists) globals[entry.key] = entry.value;
      else delete globals[entry.key];
    }
  }
};

// Prefer createKeyframe when addKeyframe throws (Blockbench API variance).
{
  let createCalls = 0;
  let addCalls = 0;
  let setTimeCalls = 0;
  let previewRenderCalls = 0;
  let lastSetTime: number | null = null;
  const animator: Record<string, unknown> = {
    keyframes: [] as Array<Record<string, unknown>>,
    rotation: [] as Array<Record<string, unknown>>,
    addKeyframe: () => {
      addCalls += 1;
      throw new TypeError("Cannot read properties of undefined (reading 'time').");
    },
    createKeyframe: (_value: unknown, time?: number, channel?: string) => {
      createCalls += 1;
      const keyframe = {
        channel,
        time,
        data_points: [{ x: 0, y: 0, z: 0 }]
      };
      (animator.keyframes as Array<Record<string, unknown>>).push(keyframe);
      return keyframe;
    }
  };
  const clip = {
    name: 'idle',
    ashfoxId: 'anim_idle',
    keyframes: [] as Array<Record<string, unknown>>,
    select: () => undefined,
    setTime: (time: number) => {
      setTimeCalls += 1;
      lastSetTime = time;
    },
    getBoneAnimator: () => animator
  };
  const outliner = { root: [{ name: 'body', children: [] }] };

  withGlobals(
    {
      Animations: [clip],
      Outliner: outliner,
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Group: undefined,
      Cube: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runSetKeyframes(noopLog, {
        clip: 'idle',
        bone: 'body',
        channel: 'rot',
        keys: [{ time: 0, value: [2, 0, 0] }]
      });
      assert.equal(err, null);
      assert.equal(createCalls, 1);
      assert.equal(addCalls, 0);
      assert.equal(setTimeCalls, 1);
      assert.equal(previewRenderCalls, 1);
      assert.equal(lastSetTime, 0);
      const first = (animator.keyframes as Array<{ data_points?: Array<{ x?: number; y?: number; z?: number }> }>)[0];
      assert.equal(first?.data_points?.[0]?.x, 2);
      assert.equal(first?.data_points?.[0]?.y, 0);
      assert.equal(first?.data_points?.[0]?.z, 0);
    }
  );
}

// Fallback to addKeyframe when createKeyframe is unavailable.
{
  let addCalls = 0;
  let animatorSetTimeCalls = 0;
  let previewRenderCalls = 0;
  let animatorLastTime: number | null = null;
  const animator: Record<string, unknown> = {
    keyframes: [] as Array<Record<string, unknown>>,
    rotation: [] as Array<Record<string, unknown>>,
    addKeyframe: (data: { time?: number; channel?: string }) => {
      addCalls += 1;
      const keyframe = {
        channel: data.channel,
        time: data.time,
        data_points: [{ x: 0, y: 0, z: 0 }]
      };
      (animator.keyframes as Array<Record<string, unknown>>).push(keyframe);
      return keyframe;
    }
  };
  const clip = {
    name: 'idle',
    ashfoxId: 'anim_idle',
    keyframes: [] as Array<Record<string, unknown>>,
    select: () => undefined,
    getBoneAnimator: () => animator
  };
  const outliner = { root: [{ name: 'body', children: [] }] };

  withGlobals(
    {
      Animations: [clip],
      Outliner: outliner,
      Animator: {
        setTime: (time: number) => {
          animatorSetTimeCalls += 1;
          animatorLastTime = time;
        }
      },
      Preview: {
        selected: {
          render: () => {
            previewRenderCalls += 1;
          }
        }
      },
      Group: undefined,
      Cube: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runSetKeyframes(noopLog, {
        clip: 'idle',
        bone: 'body',
        channel: 'rot',
        keys: [{ time: 0, value: [1, 2, 3] }]
      });
      assert.equal(err, null);
      assert.equal(addCalls, 1);
      assert.equal(animatorSetTimeCalls, 1);
      assert.equal(previewRenderCalls, 1);
      assert.equal(animatorLastTime, 0);
      const first = (animator.keyframes as Array<{ data_points?: Array<{ x?: number; y?: number; z?: number }> }>)[0];
      assert.equal(first?.data_points?.[0]?.x, 1);
      assert.equal(first?.data_points?.[0]?.y, 2);
      assert.equal(first?.data_points?.[0]?.z, 3);
    }
  );
}

