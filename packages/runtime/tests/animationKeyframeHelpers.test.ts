import assert from 'node:assert/strict';

import {
  applyKeyframeValue,
  applyTriggerValue,
  createTransformKeyframe,
  findExistingKeyframes,
  lastKeyframeTime,
  lastTriggerKeyframeTime,
  resolveAnimationChannelKey,
  sanitizeAnimatorChannel,
  sanitizeAnimatorChannels,
  sanitizeAnimatorKeyframes,
  sanitizeClipKeyframes,
  type AnimatorLike,
  type KeyframeLike
} from '../src/adapters/blockbench/animation/animationKeyframeHelpers';

assert.equal(resolveAnimationChannelKey('rot'), 'rotation');
assert.equal(resolveAnimationChannelKey('pos'), 'position');
assert.equal(resolveAnimationChannelKey('scale'), 'scale');

{
  const animator: AnimatorLike & Record<string, unknown> = {
    keyframes: [undefined, { time: 0 }, null],
    rotation: [1, { time: 1 }, undefined],
    position: ['x', { time: 2 }]
  };
  sanitizeAnimatorChannel(animator, 'rotation');
  sanitizeAnimatorChannels(animator, ['position']);
  sanitizeAnimatorKeyframes(animator);
  assert.equal(Array.isArray(animator.rotation), true);
  assert.equal(Array.isArray(animator.position), true);
  assert.equal(Array.isArray(animator.keyframes), true);
  assert.equal((animator.rotation as unknown[]).length, 1);
  assert.equal((animator.position as unknown[]).length, 1);
  assert.equal((animator.keyframes as unknown[]).length, 1);
}

{
  const clip = {
    keyframes: [null, { time: 1 }, undefined]
  };
  sanitizeClipKeyframes(clip);
  assert.equal(Array.isArray(clip.keyframes), true);
  assert.equal(clip.keyframes.length, 1);
}

assert.equal(lastKeyframeTime([]), undefined);
assert.equal(lastKeyframeTime([{ time: 3 }]), 3);
assert.equal(lastTriggerKeyframeTime([]), undefined);
assert.equal(lastTriggerKeyframeTime([{ time: 4, value: 'event' }]), 4);

{
  const created: unknown[] = [];
  const animator: AnimatorLike = {
    createKeyframe: (value, time, channel) => {
      const kf = { value, time, channel };
      created.push(kf);
      return kf as KeyframeLike;
    }
  };
  const res = createTransformKeyframe(animator, 'rotation', 2, [1, 2, 3], 'step');
  assert.ok(res.keyframe);
  assert.equal(created.length, 1);
}

{
  const createErr = new Error('create failed');
  const addCalls: unknown[] = [];
  const animator: AnimatorLike = {
    createKeyframe: () => {
      throw createErr;
    },
    addKeyframe: (data) => {
      addCalls.push(data);
      return { ...((data as Record<string, unknown>) ?? {}) } as KeyframeLike;
    }
  };
  const res = createTransformKeyframe(animator, 'rotation', 5, [0, 1, 2], 'linear');
  assert.ok(res.keyframe);
  assert.equal(addCalls.length, 1);
}

{
  const createErr = new Error('create failed');
  const animator: AnimatorLike = {
    createKeyframe: () => {
      throw createErr;
    },
    addKeyframe: () => {
      throw new Error('add failed');
    }
  };
  const res = createTransformKeyframe(animator, 'rotation', 5, [0, 1, 2], 'linear');
  assert.equal(res.error, createErr);
}

{
  const transformKeyframes: KeyframeLike[] = [
    { time: 8, channel: 'rotation' } as KeyframeLike,
    { time: 8.01, channel: 'position' } as KeyframeLike
  ];
  const animator: AnimatorLike = { keyframes: transformKeyframes };
  const matches = findExistingKeyframes(animator, 'rot', 8);
  assert.equal(matches.length, 1);
}

{
  const triggerKeyframes: KeyframeLike[] = [
    { time: 2, channel: 'sound' } as KeyframeLike,
    { time: 2, channel: 'particle' } as KeyframeLike
  ];
  const animator: AnimatorLike = { keyframes: triggerKeyframes };
  const matches = findExistingKeyframes(animator, 'sound', 2);
  assert.equal(matches.length, 1);
}

{
  const assigned: Record<string, unknown> = {};
  const keyframe: KeyframeLike = {
    set: (key, value) => {
      assigned[key] = value;
    }
  };
  applyKeyframeValue(keyframe, [10, 20, 30], 'step');
  assert.deepEqual(assigned, { x: 10, y: 20, z: 30 });
  assert.equal(keyframe.interpolation, 'step');
}

{
  const keyframe: KeyframeLike = { data_points: [{}] };
  applyKeyframeValue(keyframe, [3, 4, 5]);
  const point = (keyframe.data_points as Array<Record<string, unknown>>)[0];
  assert.equal(point.x, 3);
  assert.equal(point.y, 4);
  assert.equal(point.z, 5);
}

{
  const assigned: Record<string, unknown> = {};
  const keyframe: KeyframeLike = {
    set: (key, value) => {
      assigned[key] = value;
    }
  };
  applyTriggerValue(keyframe, 'event.step');
  assert.equal(assigned.data_point, 'event.step');
  assert.equal(assigned.data_points, 'event.step');
  assert.equal(assigned.value, 'event.step');
  assert.equal(assigned.data, 'event.step');
}

{
  const keyframe: KeyframeLike = {};
  applyTriggerValue(keyframe, { id: 'spark' });
  assert.deepEqual(keyframe.data_point, { id: 'spark' });
  assert.deepEqual(keyframe.data_points, { id: 'spark' });
  assert.deepEqual(keyframe.value, { id: 'spark' });
  assert.deepEqual(keyframe.data, { id: 'spark' });
}
