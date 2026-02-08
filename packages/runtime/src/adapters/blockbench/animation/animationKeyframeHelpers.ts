import { keyframeTimeBucket } from '../../../domain/animation/keyframes';
import { normalizeAnimationChannel, normalizeTriggerChannel } from '../../../domain/animation/channels';
import type { KeyframeCommand } from '../../../ports/editor';

export type KeyframeLike = {
  set?: (key: string, value: unknown) => void;
  data_point?: unknown;
  data_points?: unknown;
  value?: unknown;
  data?: unknown;
  interpolation?: unknown;
};

export type AnimatorLike = {
  createKeyframe?: (
    value: unknown,
    time?: number,
    channel?: string,
    undo?: boolean,
    select?: boolean
  ) => KeyframeLike | undefined;
  addKeyframe?: (data: unknown, uuid?: string) => KeyframeLike | undefined;
  keyframes?: unknown[];
};

export const resolveAnimationChannelKey = (channel: KeyframeCommand['channel']): string => {
  switch (channel) {
    case 'rot':
      return 'rotation';
    case 'pos':
      return 'position';
    case 'scale':
      return 'scale';
  }
};

const sanitizeKeyframeList = (list: unknown[] | undefined) => {
  if (!Array.isArray(list)) return;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object') {
      try {
        list.splice(i, 1);
      } catch (err) {
        void err;
        break;
      }
    }
  }
};

export const sanitizeAnimatorChannel = (animator: AnimatorLike, channel: string) => {
  const record = animator as Record<string, unknown>;
  sanitizeKeyframeList(record[channel] as unknown[] | undefined);
};

export const sanitizeAnimatorChannels = (animator: AnimatorLike, channels: string[]) => {
  channels.forEach((channel) => sanitizeAnimatorChannel(animator, channel));
};

export const sanitizeAnimatorKeyframes = (animator: AnimatorLike) => {
  sanitizeKeyframeList(animator.keyframes);
};

export const sanitizeClipKeyframes = <T extends { keyframes?: unknown[] }>(clip: T) => {
  sanitizeKeyframeList(clip.keyframes);
};

const buildKeyframeValueData = (value: unknown, interp?: string): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  if (Array.isArray(value)) {
    const normalized = value.map((entry) =>
      typeof entry === 'number' && Number.isFinite(entry) ? entry : 0
    );
    data.data_points = [{ x: normalized[0], y: normalized[1], z: normalized[2] }];
  }
  if (interp) data.interpolation = interp;
  return data;
};

export const lastKeyframeTime = (keys: Array<{ time: number }>): number | undefined => {
  if (!Array.isArray(keys) || keys.length === 0) return undefined;
  const last = keys[keys.length - 1];
  const time = Number(last?.time);
  return Number.isFinite(time) ? time : undefined;
};

export const lastTriggerKeyframeTime = (
  keys: Array<{ time: number; value: string | string[] | Record<string, unknown> }>
): number | undefined => {
  if (!Array.isArray(keys) || keys.length === 0) return undefined;
  const last = keys[keys.length - 1];
  const time = Number(last?.time);
  return Number.isFinite(time) ? time : undefined;
};

export const createTransformKeyframe = (
  animator: AnimatorLike,
  channel: string,
  time: number,
  value: unknown,
  interp?: string
): { keyframe?: KeyframeLike; error?: unknown } => {
  const valueData = buildKeyframeValueData(value, interp);
  const numericTime = Number(time);
  const resolvedTime = Number.isFinite(numericTime) ? numericTime : 0;
  let lastError: unknown = null;

  if (typeof animator.createKeyframe === 'function') {
    const createValue = Array.isArray(value) ? value : valueData;
    try {
      const created = animator.createKeyframe(createValue, resolvedTime, channel, false, false);
      if (created) return { keyframe: created };
    } catch (err) {
      lastError = err;
    }
  }

  if (typeof animator.addKeyframe === 'function') {
    try {
      const created = animator.addKeyframe({ channel, time: resolvedTime, ...valueData });
      if (created) return { keyframe: created };
    } catch (err) {
      if (!lastError) lastError = err;
    }
  }

  if (lastError) return { error: lastError };
  return {};
};

const readKeyframeTime = (keyframe: KeyframeLike): number => {
  const raw = (keyframe as { time?: unknown; frame?: unknown }).time ?? (keyframe as { frame?: unknown }).frame;
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export const findExistingKeyframes = (
  animator: AnimatorLike | undefined,
  channel: string,
  time: number,
  timePolicy?: KeyframeCommand['timePolicy']
): KeyframeLike[] => {
  if (!animator || !Array.isArray(animator.keyframes)) return [];
  const targetTime = Number(time);
  if (!Number.isFinite(targetTime)) return [];
  const targetBucket = keyframeTimeBucket(targetTime, timePolicy);
  const channelRaw = channel.toLowerCase();
  const isTransformChannel = channelRaw === 'rot' || channelRaw === 'pos' || channelRaw === 'scale';
  const targetChannel = isTransformChannel
    ? normalizeAnimationChannel(channelRaw)
    : normalizeTriggerChannel(channelRaw);
  const matches: KeyframeLike[] = [];
  animator.keyframes.forEach((kf) => {
    if (!kf || typeof kf !== 'object') return false;
    const keyframe = kf as KeyframeLike;
    const keyTime = readKeyframeTime(keyframe);
    if (keyframeTimeBucket(keyTime, timePolicy) !== targetBucket) return false;
    const rawChannel = String(
      (keyframe as { channel?: unknown; data_channel?: unknown; transform?: unknown }).channel ??
        (keyframe as { data_channel?: unknown }).data_channel ??
        (keyframe as { transform?: unknown }).transform ??
        ''
    );
    const normalizedChannel = isTransformChannel
      ? normalizeAnimationChannel(rawChannel)
      : normalizeTriggerChannel(rawChannel);
    if (normalizedChannel !== targetChannel) return false;
    matches.push(keyframe);
    return true;
  });
  return matches;
};

export const applyKeyframeValue = (keyframe: KeyframeLike, value: unknown, interp?: string) => {
  if (!Array.isArray(value)) return;
  const normalized = value.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) ? entry : 0));
  if (keyframe.set) {
    keyframe.set('x', normalized[0]);
    keyframe.set('y', normalized[1]);
    keyframe.set('z', normalized[2]);
  } else if (Array.isArray(keyframe.data_points) && keyframe.data_points[0]) {
    const point = keyframe.data_points[0] as Record<string, unknown>;
    point.x = normalized[0];
    point.y = normalized[1];
    point.z = normalized[2];
  } else {
    keyframe.data_points = [{ x: normalized[0], y: normalized[1], z: normalized[2] }];
  }
  if (interp) keyframe.interpolation = interp;
};

export const applyTriggerValue = (keyframe: KeyframeLike, value: unknown) => {
  if (typeof keyframe.set === 'function') {
    keyframe.set('data_point', value);
    keyframe.set('data_points', value);
    keyframe.set('value', value);
    keyframe.set('data', value);
    return;
  }
  keyframe.data_point = value;
  keyframe.data_points = value;
  keyframe.value = value;
  keyframe.data = value;
};
