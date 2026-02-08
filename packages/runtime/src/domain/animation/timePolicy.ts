export type AnimationTimePolicy = {
  timeEpsilon: number;
  triggerDedupeByValue: boolean;
};

export const DEFAULT_ANIMATION_TIME_POLICY: AnimationTimePolicy = {
  timeEpsilon: 1e-9,
  triggerDedupeByValue: true
};

export const resolveAnimationTimePolicy = (
  policy?: Partial<AnimationTimePolicy>
): AnimationTimePolicy => {
  const resolved: AnimationTimePolicy = { ...DEFAULT_ANIMATION_TIME_POLICY };
  if (policy) {
    if (typeof policy.timeEpsilon === 'number' && Number.isFinite(policy.timeEpsilon)) {
      resolved.timeEpsilon = Math.max(1e-12, policy.timeEpsilon);
    }
    if (typeof policy.triggerDedupeByValue === 'boolean') {
      resolved.triggerDedupeByValue = policy.triggerDedupeByValue;
    }
  }
  return resolved;
};
