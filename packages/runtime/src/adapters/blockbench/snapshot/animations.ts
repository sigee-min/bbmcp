import type { AnimationClip, BlockbenchGlobals, UnknownRecord } from '../../../types/blockbench';
import type { TrackedAnimationChannel, TrackedAnimationTrigger } from '../../../session';
import { isRecord } from '../../../domain/guards';
import { normalizeKeyframeTime } from '../../../domain/animation/keyframes';
import { normalizeAnimationChannel, normalizeTriggerChannel } from '../../../domain/animation/channels';

export const getAnimationState = (
  globals: BlockbenchGlobals
): { animations: AnimationClip[]; status: 'available' | 'unavailable' } => {
  if (Array.isArray(globals.Animations)) return { animations: globals.Animations, status: 'available' };
  if (Array.isArray(globals.Animation?.all)) return { animations: globals.Animation.all, status: 'available' };
  return { animations: [], status: 'unavailable' };
};

export const extractChannels = (
  anim: AnimationClip
): { channels?: TrackedAnimationChannel[]; triggers?: TrackedAnimationTrigger[] } => {
  const animators = anim?.animators;
  if (!animators || typeof animators !== 'object') return {};
  const channels: TrackedAnimationChannel[] = [];
  const triggerBuckets: Record<'sound' | 'particle' | 'timeline', TrackedAnimationTrigger['keys']> = {
    sound: [],
    particle: [],
    timeline: []
  };
  Object.entries(animators).forEach(([bone, animator]) => {
    if (!isRecord(animator)) return;
    const grouped = collectAnimatorChannels(animator);
    grouped.forEach((entry) => {
      channels.push({ bone, channel: entry.channel, keys: entry.keys });
    });
    const triggerGroups = collectAnimatorTriggers(animator);
    triggerGroups.forEach((entry) => {
      triggerBuckets[entry.type].push(...entry.keys);
    });
  });
  const triggers = (Object.entries(triggerBuckets) as Array<
    ['sound' | 'particle' | 'timeline', TrackedAnimationTrigger['keys']]
  >)
    .filter(([, keys]) => keys.length > 0)
    .map(([type, keys]) => ({ type, keys }));
  return {
    channels: channels.length > 0 ? channels : undefined,
    triggers: triggers.length > 0 ? triggers : undefined
  };
};

export const normalizeLoop = (loopValue: unknown): boolean => {
  if (typeof loopValue === 'string') return loopValue === 'loop';
  return Boolean(loopValue);
};

const collectAnimatorChannels = (
  animator: UnknownRecord
): Array<{ channel: 'rot' | 'pos' | 'scale'; keys: TrackedAnimationChannel['keys'] }> => {
  const buckets: Record<'rot' | 'pos' | 'scale', TrackedAnimationChannel['keys']> = {
    rot: [],
    pos: [],
    scale: []
  };
  const keyframes = Array.isArray(animator.keyframes) ? animator.keyframes : [];
  keyframes.forEach((kf) => {
    if (!isRecord(kf)) return;
    const channel = normalizeAnimationChannel(kf.channel ?? kf.data_channel ?? kf.transform);
    const value = kf.data_points ?? kf.value ?? kf.data_point;
    if (!channel || !Array.isArray(value) || value.length < 3) return;
    buckets[channel].push({
      time: normalizeKeyframeTime(Number(kf.time ?? kf.frame ?? 0)),
      value: [value[0], value[1], value[2]],
      interp: normalizeInterp(kf.interpolation)
    });
  });
  return Object.entries(buckets)
    .filter(([, keys]) => keys.length > 0)
    .map(([channel, keys]) => ({ channel: channel as 'rot' | 'pos' | 'scale', keys }));
};

const collectAnimatorTriggers = (
  animator: UnknownRecord
): Array<{ type: 'sound' | 'particle' | 'timeline'; keys: TrackedAnimationTrigger['keys'] }> => {
  const buckets: Record<'sound' | 'particle' | 'timeline', TrackedAnimationTrigger['keys']> = {
    sound: [],
    particle: [],
    timeline: []
  };
  const keyframes = Array.isArray(animator.keyframes) ? animator.keyframes : [];
  keyframes.forEach((kf) => {
    if (!isRecord(kf)) return;
    const type = normalizeTriggerChannel(kf.channel ?? kf.data_channel ?? kf.transform);
    if (!type) return;
    const value = normalizeTriggerValue(kf.data_point ?? kf.data_points ?? kf.value ?? kf.data);
    if (value === null) return;
    buckets[type].push({
      time: normalizeKeyframeTime(Number(kf.time ?? kf.frame ?? 0)),
      value
    });
  });
  return (Object.entries(buckets) as Array<
    ['sound' | 'particle' | 'timeline', TrackedAnimationTrigger['keys']]
  >)
    .filter(([, keys]) => keys.length > 0)
    .map(([type, keys]) => ({ type, keys }));
};

const normalizeTriggerValue = (
  value: unknown
): string | string[] | Record<string, unknown> | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return value as string[];
    const allNumbers = value.every((item) => typeof item === 'number');
    if (allNumbers) return null;
    const allStrings = value.every((item) => typeof item === 'string');
    if (allStrings) return value as string[];
    return null;
  }
  if (isRecord(value)) return value;
  return null;
};

const normalizeInterp = (value: unknown): 'linear' | 'step' | 'catmullrom' | undefined => {
  const interp = String(value ?? '').toLowerCase();
  if (interp.includes('step')) return 'step';
  if (interp.includes('catmull')) return 'catmullrom';
  if (interp.includes('linear')) return 'linear';
  return undefined;
};
