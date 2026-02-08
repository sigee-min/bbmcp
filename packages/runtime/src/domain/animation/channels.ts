export type AnimationChannel = 'rot' | 'pos' | 'scale';
export type TriggerChannel = 'sound' | 'particle' | 'timeline';

export const normalizeAnimationChannel = (value: unknown): AnimationChannel | null => {
  const channel = String(value ?? '').toLowerCase();
  if (channel.includes('rot')) return 'rot';
  if (channel.includes('pos')) return 'pos';
  if (channel.includes('scale')) return 'scale';
  return null;
};

export const normalizeTriggerChannel = (value: unknown): TriggerChannel | null => {
  const channel = String(value ?? '').toLowerCase();
  if (channel.includes('sound')) return 'sound';
  if (channel.includes('particle')) return 'particle';
  if (channel.includes('timeline') || channel.includes('event')) return 'timeline';
  return null;
};
