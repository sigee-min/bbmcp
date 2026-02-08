import type { AnimationClip } from '../../../types/blockbench';

export const assignAnimationLength = (target: AnimationClip, value: number) => {
  if (typeof target.length === 'number') {
    target.length = value;
  }
  if (typeof target.animation_length === 'number') {
    target.animation_length = value;
  }
  if (typeof target.duration === 'number') {
    target.duration = value;
  }
};
