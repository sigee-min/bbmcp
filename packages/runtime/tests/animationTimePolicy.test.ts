import assert from 'node:assert/strict';

import { mergeTriggerKeys, mergeChannelKeys, normalizeKeyframeTime } from '../src/domain/animation/keyframes';

const triggerKeys = mergeTriggerKeys(
  [{ time: 0.1, value: 'a' }],
  [{ time: 0.1 + 1e-12, value: 'a' }, { time: 0.1, value: 'b' }]
);
assert.equal(triggerKeys.length, 2);
assert.equal(triggerKeys[0].value, 'a');
assert.equal(triggerKeys[1].value, 'b');

const channelKeys = mergeChannelKeys(
  [{ time: 0.1, value: [0, 0, 0] }],
  [{ time: 0.1 + 1e-12, value: [1, 0, 0] }]
);
assert.equal(channelKeys.length, 1);
assert.equal(channelKeys[0].value[0], 1);
assert.equal(channelKeys[0].time, normalizeKeyframeTime(0.1));
