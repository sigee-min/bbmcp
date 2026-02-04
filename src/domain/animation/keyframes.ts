import { AnimationTimePolicy, resolveAnimationTimePolicy } from './timePolicy';

type AnimationTimePolicyInput = AnimationTimePolicy | Partial<AnimationTimePolicy> | undefined;

const resolvePolicy = (policy?: AnimationTimePolicyInput): AnimationTimePolicy =>
  resolveAnimationTimePolicy(policy);

const normalizeKeyframeTimeWithPolicy = (time: number, policy: AnimationTimePolicy): number => {
  if (!Number.isFinite(time)) return 0;
  const factor = 1 / policy.timeEpsilon;
  return Math.round(time * factor) / factor;
};

export const normalizeKeyframeTime = (time: number, policy?: AnimationTimePolicyInput): number =>
  normalizeKeyframeTimeWithPolicy(time, resolvePolicy(policy));

export const keyframeTimeBucket = (time: number, policy?: AnimationTimePolicyInput): number => {
  const resolved = resolvePolicy(policy);
  return Math.round(normalizeKeyframeTimeWithPolicy(time, resolved) / resolved.timeEpsilon);
};

type TimedKey = { time: number };

type ChannelKey = TimedKey & { value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' };

export const mergeChannelKeys = (
  existing: ChannelKey[] | undefined,
  incoming: ChannelKey[],
  policy?: AnimationTimePolicyInput
): ChannelKey[] => {
  const resolved = resolvePolicy(policy);
  const merged = new Map<number, ChannelKey>();
  for (const key of existing ?? []) {
    merged.set(keyframeTimeBucket(key.time, resolved), {
      ...key,
      time: normalizeKeyframeTimeWithPolicy(key.time, resolved)
    });
  }
  for (const key of incoming) {
    merged.set(keyframeTimeBucket(key.time, resolved), {
      ...key,
      time: normalizeKeyframeTimeWithPolicy(key.time, resolved)
    });
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
};

type TriggerKey = TimedKey & { value: string | string[] | Record<string, unknown> };

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `"${key}":${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
};

const triggerKeySignature = (key: TriggerKey, policy: AnimationTimePolicy): string =>
  policy.triggerDedupeByValue
    ? `${keyframeTimeBucket(key.time, policy)}:${stableStringify(key.value)}`
    : `${keyframeTimeBucket(key.time, policy)}`;

export const mergeTriggerKeys = (
  existing: TriggerKey[] | undefined,
  incoming: TriggerKey[],
  policy?: AnimationTimePolicyInput
): TriggerKey[] => {
  const resolved = resolvePolicy(policy);
  const merged = new Map<string, TriggerKey>();
  for (const key of existing ?? []) {
    const normalized = { ...key, time: normalizeKeyframeTimeWithPolicy(key.time, resolved) };
    merged.set(triggerKeySignature(normalized, resolved), normalized);
  }
  for (const key of incoming) {
    const normalized = { ...key, time: normalizeKeyframeTimeWithPolicy(key.time, resolved) };
    merged.set(triggerKeySignature(normalized, resolved), normalized);
  }
  return [...merged.values()].sort((a, b) => a.time - b.time);
};
