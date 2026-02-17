import assert from 'node:assert/strict';

import { runSetKeyframes, runSetTriggerKeyframes } from '../src/adapters/blockbench/animation/animationCommands';
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

// If both createKeyframe and addKeyframe fail, adapter_exception should be returned.
{
  const animator = {
    keyframes: [] as Array<Record<string, unknown>>,
    rotation: [] as Array<Record<string, unknown>>,
    createKeyframe: () => {
      throw new TypeError("Cannot read properties of undefined (reading 'time').");
    },
    addKeyframe: () => {
      throw new TypeError("Cannot read properties of undefined (reading 'time').");
    }
  };
  const clip = {
    name: 'idle',
    keyframes: [] as Array<Record<string, unknown>>,
    select: () => undefined,
    getBoneAnimator: () => animator
  };
  const outliner = { root: [{ name: 'body', children: [] }] };
  withGlobals(
    {
      Animations: [clip],
      Outliner: outliner,
      Group: undefined,
      Cube: undefined,
      Animator: undefined,
      EffectAnimator: undefined,
      Preview: undefined,
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
      assert.notEqual(err, null);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.reason, 'adapter_exception');
      assert.equal(err?.details?.context, 'keyframe_set');
    }
  );
}

// Trigger keyframe path should return invalid_state when no effect animator is available.
{
  const clip = {
    name: 'idle',
    keyframes: [] as Array<Record<string, unknown>>,
    animators: {}
  };
  withGlobals(
    {
      Animations: [clip],
      Outliner: { root: [] },
      EffectAnimator: undefined,
      Animator: undefined,
      Preview: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runSetTriggerKeyframes(noopLog, {
        clip: 'idle',
        channel: 'sound',
        keys: [{ time: 0, value: 'step' }]
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_state');
    }
  );
}

// Trigger keyframe path should use Animator.preview fallback and render unique previews once.
{
  let previewCalls: number[] = [];
  let animatorPreviewCalls = 0;
  let previewTime = 0;
  const effectsAnimator = {
    keyframes: [] as Array<Record<string, unknown>>,
    sound: [] as Array<Record<string, unknown>>,
    createKeyframe: (_value: unknown, time?: number, channel?: string) => {
      const keyframe = { channel, time };
      effectsAnimator.keyframes.push(keyframe);
      return keyframe;
    }
  };
  const clip = {
    name: 'idle',
    keyframes: [] as Array<Record<string, unknown>>,
    animators: { effects: effectsAnimator },
    select: () => undefined
  };
  const previewA = {
    render: () => {
      previewCalls.push(1);
    }
  };
  const previewB = {
    render: () => {
      previewCalls.push(2);
    }
  };
  withGlobals(
    {
      Animations: [clip],
      Animator: {
        preview: (time: number) => {
          animatorPreviewCalls += 1;
          previewTime = time;
        }
      },
      Preview: {
        selected: previewA,
        all: [previewA, previewB]
      },
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runSetTriggerKeyframes(noopLog, {
        clip: 'idle',
        channel: 'sound',
        keys: [{ time: 2, value: 'fx' }]
      });
      assert.equal(err, null);
      assert.equal(animatorPreviewCalls, 1);
      assert.equal(previewTime, 2);
      assert.equal(previewCalls.length, 2);
      assert.equal(previewCalls.filter((v) => v === 1).length, 1);
      assert.equal(previewCalls.filter((v) => v === 2).length, 1);
      assert.equal(effectsAnimator.keyframes.length, 1);
    }
  );
}

// Refresh should not fail the tool call even when preview rendering throws.
{
  let setTimeCalls = 0;
  const animator = {
    keyframes: [] as Array<Record<string, unknown>>,
    rotation: [] as Array<Record<string, unknown>>,
    addKeyframe: (payload: { channel?: string; time?: number }) => {
      const keyframe = { channel: payload.channel, time: payload.time, data_points: [{ x: 0, y: 0, z: 0 }] };
      animator.keyframes.push(keyframe);
      return keyframe;
    }
  };
  const clip = {
    name: 'idle',
    keyframes: [] as Array<Record<string, unknown>>,
    select: () => undefined,
    setTime: (_time: number) => {
      setTimeCalls += 1;
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
            throw new Error('preview fail');
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
        keys: [{ time: 3, value: [1, 1, 1] }]
      });
      assert.equal(err, null);
      assert.equal(setTimeCalls, 1);
    }
  );
}

// When no setTime/Animator API exists, refresh should write clip.time directly.
{
  const animator = {
    keyframes: [] as Array<Record<string, unknown>>,
    rotation: [] as Array<Record<string, unknown>>,
    addKeyframe: (payload: { channel?: string; time?: number }) => {
      const keyframe = { channel: payload.channel, time: payload.time, data_points: [{ x: 0, y: 0, z: 0 }] };
      animator.keyframes.push(keyframe);
      return keyframe;
    }
  };
  const clip: {
    name: string;
    keyframes: Array<Record<string, unknown>>;
    time: number;
    select: () => void;
    getBoneAnimator: () => typeof animator;
  } = {
    name: 'idle',
    keyframes: [],
    time: 0,
    select: () => undefined,
    getBoneAnimator: () => animator
  };
  const outliner = { root: [{ name: 'body', children: [] }] };
  withGlobals(
    {
      Animations: [clip],
      Outliner: outliner,
      Animator: undefined,
      Preview: undefined,
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
        keys: [{ time: 4, value: [2, 2, 2] }]
      });
      assert.equal(err, null);
      assert.equal(clip.time, 4);
    }
  );
}
