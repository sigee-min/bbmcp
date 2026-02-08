import type { AnimationClip, BlockbenchGlobals } from '../../../types/blockbench';

export const reevaluateAnimation = (globals: BlockbenchGlobals): void => {
  const clip = globals.Animation?.selected as AnimationClip | undefined;
  if (!clip) return;
  const currentTime = readAnimationTime(clip, globals.Animator?.time);
  if (!Number.isFinite(currentTime)) return;
  if (typeof clip.select === 'function') {
    clip.select();
  } else if (globals.Animation?.selected) {
    globals.Animation.selected = clip;
  }
  if (typeof clip.setTime === 'function') {
    clip.setTime(currentTime);
    return;
  }
  if (typeof globals.Animator?.setTime === 'function') {
    globals.Animator.setTime(currentTime);
    return;
  }
  if (typeof globals.Animator?.preview === 'function') {
    globals.Animator.preview(currentTime);
    return;
  }
  if (typeof clip.time === 'number') {
    clip.time = currentTime;
  }
};

const readAnimationTime = (clip: AnimationClip, animatorTime: unknown): number => {
  const clipTime = Number(clip.time);
  if (Number.isFinite(clipTime)) return clipTime;
  const fallback = Number(animatorTime);
  return Number.isFinite(fallback) ? fallback : NaN;
};
