import type { TrackedAnimation, TrackedAnimationChannel, TrackedAnimationTrigger } from './types';

const cloneTriggerValue = (value: string | string[] | Record<string, unknown>): typeof value => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === 'object' && entry !== null ? cloneTriggerValue(entry as Record<string, unknown>) : entry
    ) as typeof value;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const cloned: Record<string, unknown> = {};
    Object.keys(record).forEach((key) => {
      const entry = record[key];
      if (Array.isArray(entry)) {
        cloned[key] = entry.map((item) =>
          typeof item === 'object' && item !== null ? cloneTriggerValue(item as Record<string, unknown>) : item
        );
      } else if (typeof entry === 'object' && entry !== null) {
        cloned[key] = cloneTriggerValue(entry as Record<string, unknown>);
      } else {
        cloned[key] = entry;
      }
    });
    return cloned as typeof value;
  }
  return value;
};

const cloneAnimationChannel = (channel: TrackedAnimationChannel): TrackedAnimationChannel => ({
  ...channel,
  keys: channel.keys.map((key) => ({
    time: key.time,
    value: [key.value[0], key.value[1], key.value[2]],
    interp: key.interp
  }))
});

const cloneAnimationTrigger = (trigger: TrackedAnimationTrigger): TrackedAnimationTrigger => ({
  ...trigger,
  keys: trigger.keys.map((key) => ({
    time: key.time,
    value: cloneTriggerValue(key.value)
  }))
});

const cloneAnimation = (anim: TrackedAnimation): TrackedAnimation => ({
  ...anim,
  channels: anim.channels ? anim.channels.map(cloneAnimationChannel) : undefined,
  triggers: anim.triggers ? anim.triggers.map(cloneAnimationTrigger) : undefined
});

export const cloneAnimations = (animations: TrackedAnimation[]): TrackedAnimation[] => animations.map(cloneAnimation);
