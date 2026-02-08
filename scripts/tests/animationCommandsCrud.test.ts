import assert from 'node:assert/strict';

import {
  getAnimations,
  runCreateAnimation,
  runDeleteAnimation,
  runSetTriggerKeyframes,
  runUpdateAnimation
} from '../../src/adapters/blockbench/animation/animationCommands';
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

{
  withGlobals(
    {
      Animation: undefined
    },
    () => {
      const err = runCreateAnimation(noopLog, {
        name: 'idle',
        length: 1,
        loop: true,
        fps: 24
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
    }
  );
}

{
  class ThrowingAnimation {
    constructor() {
      throw new Error('ctor fail');
    }
  }
  withGlobals(
    {
      Animation: ThrowingAnimation,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runCreateAnimation(noopLog, {
        name: 'idle',
        length: 1,
        loop: true,
        fps: 24
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.context, 'animation_create');
    }
  );
}

{
  withGlobals(
    {
      Animations: []
    },
    () => {
      const err = runUpdateAnimation(noopLog, { name: 'idle', newName: 'walk' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

{
  const clip = {
    name: 'idle',
    length: 1,
    loop: 'once',
    snapping: 24
  };
  withGlobals(
    {
      Animations: [clip],
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runUpdateAnimation(noopLog, {
        id: 'anim_idle',
        name: 'idle',
        newName: 'walk',
        length: 2,
        loop: true,
        fps: 12
      });
      assert.equal(err, null);
      assert.equal(clip.ashfoxId, 'anim_idle');
      assert.equal(clip.name, 'walk');
      assert.equal(clip.length, 2);
      assert.equal(clip.loop, 'loop');
      assert.equal(clip.snapping, 12);
    }
  );
}

{
  const clip = {
    name: 'idle',
    length: 1,
    loop: false,
    fps: 24
  };
  withGlobals(
    {
      Animations: [clip],
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runUpdateAnimation(noopLog, {
        name: 'idle',
        loop: true,
        fps: 30
      });
      assert.equal(err, null);
      assert.equal(clip.loop, true);
      assert.equal(clip.fps, 30);
    }
  );
}

{
  const clip = {
    name: 'idle',
    rename: () => {
      throw new Error('rename fail');
    }
  };
  withGlobals(
    {
      Animations: [clip],
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runUpdateAnimation(noopLog, {
        name: 'idle',
        newName: 'walk'
      });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.context, 'animation_update');
    }
  );
}

{
  withGlobals(
    {
      Animations: []
    },
    () => {
      const err = runDeleteAnimation(noopLog, { name: 'idle' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'invalid_payload');
    }
  );
}

{
  let removed = 0;
  const clip = {
    name: 'idle',
    remove: () => {
      removed += 1;
    }
  };
  const list = [clip];
  withGlobals(
    {
      Animations: list,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runDeleteAnimation(noopLog, { name: 'idle' });
      assert.equal(err, null);
      assert.equal(removed, 1);
      assert.equal(list.length, 1);
    }
  );
}

{
  const clip = { name: 'idle' };
  const list = [clip];
  withGlobals(
    {
      Animations: list,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runDeleteAnimation(noopLog, { name: 'idle' });
      assert.equal(err, null);
      assert.equal(list.length, 0);
    }
  );
}

{
  const clip = {
    name: 'idle',
    remove: () => {
      throw new Error('delete fail');
    }
  };
  withGlobals(
    {
      Animations: [clip],
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runDeleteAnimation(noopLog, { name: 'idle' });
      assert.notEqual(err, null);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.context, 'animation_delete');
    }
  );
}

{
  let createCalls = 0;
  class EffectAnimator {
    keyframes: Array<Record<string, unknown>> = [];
    sound: Array<Record<string, unknown>> = [];

    constructor(_clip: unknown) {
      return this;
    }

    createKeyframe(_value: unknown, time?: number, channel?: string) {
      createCalls += 1;
      const keyframe = { time, channel };
      this.keyframes.push(keyframe);
      return keyframe;
    }
  }
  const clip = {
    name: 'idle',
    keyframes: [] as Array<Record<string, unknown>>,
    animators: {} as Record<string, unknown>,
    select: () => undefined
  };
  withGlobals(
    {
      Animations: undefined,
      Animation: { all: [clip] },
      EffectAnimator,
      Preview: undefined,
      Animator: undefined,
      Undo: undefined,
      Blockbench: undefined
    },
    () => {
      const err = runSetTriggerKeyframes(noopLog, {
        clip: 'idle',
        channel: 'sound',
        keys: [{ time: 1, value: 'step' }]
      });
      assert.equal(err, null);
      assert.equal(createCalls, 1);
      assert.equal(typeof clip.animators.effects, 'object');
    }
  );
}

{
  withGlobals(
    {
      Animations: undefined,
      Animation: undefined
    },
    () => {
      const list = getAnimations();
      assert.deepEqual(list, []);
    }
  );
}

