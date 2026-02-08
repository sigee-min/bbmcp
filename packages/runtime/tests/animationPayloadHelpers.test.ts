import assert from 'node:assert/strict';

import { validateAnimationFps, validateAnimationLength } from '../src/usecases/animation/clipValidation';
import { buildPoseUpdates, resolvePoseFps } from '../src/usecases/animation/posePayload';
import { isValidTriggerPayloadValue } from '../src/usecases/animation/triggerPayload';
import {
  ANIMATION_FPS_POSITIVE,
  ANIMATION_LENGTH_EXCEEDS_MAX,
  ANIMATION_LENGTH_POSITIVE,
  ANIMATION_POSE_BONES_REQUIRED,
  ANIMATION_POSE_CHANNEL_REQUIRED,
  ANIMATION_POSE_VALUE_INVALID,
  MODEL_BONE_NOT_FOUND
} from '../src/shared/messages';

const normalizeMessage = (value: string): string => value.replace(/[.]$/, '');

{
  const err = validateAnimationLength(0, 30);
  assert.equal(normalizeMessage(String(err?.message)), normalizeMessage(ANIMATION_LENGTH_POSITIVE));
}

{
  const err = validateAnimationLength(31, 30);
  assert.equal(normalizeMessage(String(err?.message)), normalizeMessage(ANIMATION_LENGTH_EXCEEDS_MAX(30)));
}

{
  const err = validateAnimationLength(1.5, 30);
  assert.equal(err, null);
}

{
  const err = validateAnimationFps(0);
  assert.equal(normalizeMessage(String(err?.message)), normalizeMessage(ANIMATION_FPS_POSITIVE));
}

{
  const err = validateAnimationFps(24);
  assert.equal(err, null);
}

{
  const res = buildPoseUpdates([], new Set(['body']));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(normalizeMessage(res.error.message), normalizeMessage(ANIMATION_POSE_BONES_REQUIRED));
}

{
  const res = buildPoseUpdates([{ name: 'head', rot: [0, 0, 0] }], new Set(['body']));
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(normalizeMessage(res.error.message), normalizeMessage(MODEL_BONE_NOT_FOUND('head')));
  }
}

{
  const res = buildPoseUpdates([{ name: 'body' }], new Set(['body']));
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(normalizeMessage(res.error.message), normalizeMessage(ANIMATION_POSE_CHANNEL_REQUIRED));
  }
}

{
  const res = buildPoseUpdates(
    [{ name: 'body', rot: [Number.NaN, 0, 0] as [number, number, number] }],
    new Set(['body'])
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(normalizeMessage(res.error.message), normalizeMessage(ANIMATION_POSE_VALUE_INVALID));
  }
}

{
  const res = buildPoseUpdates(
    [{ name: 'body', rot: [1, 2, 3], pos: [4, 5, 6], interp: 'step' }],
    new Set(['body']),
    'linear'
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.length, 2);
    assert.equal(res.value[0].channel, 'rot');
    assert.equal(res.value[0].interp, 'step');
    assert.equal(res.value[1].channel, 'pos');
  }
}

{
  assert.equal(resolvePoseFps({ fps: 30 }), 30);
  assert.equal(resolvePoseFps({}), 20);
}

{
  assert.equal(isValidTriggerPayloadValue('sound.step'), true);
  assert.equal(isValidTriggerPayloadValue(['a', 'b']), true);
  assert.equal(isValidTriggerPayloadValue({ key: 'value', nested: [1, true, null] }), true);
  assert.equal(isValidTriggerPayloadValue(['ok', 1]), false);
  assert.equal(isValidTriggerPayloadValue({ n: Number.NaN }), false);
  assert.equal(isValidTriggerPayloadValue(() => undefined), false);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(isValidTriggerPayloadValue(cyclic), false);
}
