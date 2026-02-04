import type { AnimationUpdate, SessionState, TrackedAnimation, TrackedAnimationChannel, TrackedAnimationTrigger } from '../types';
import { mergeChannelKeys, mergeTriggerKeys } from '../../domain/animation/keyframes';

export const addAnimation = (state: SessionState, anim: TrackedAnimation) => {
  state.animations.push(anim);
};

export const updateAnimation = (state: SessionState, name: string, updates: AnimationUpdate): boolean => {
  const anim = state.animations.find((a) => a.name === name);
  if (!anim) return false;
  if (updates.id) anim.id = updates.id;
  if (updates.newName && updates.newName !== anim.name) anim.name = updates.newName;
  if (typeof updates.length === 'number') anim.length = updates.length;
  if (typeof updates.loop === 'boolean') anim.loop = updates.loop;
  if (typeof updates.fps === 'number') anim.fps = updates.fps;
  return true;
};

export const removeAnimations = (state: SessionState, names: string[] | Set<string>): number => {
  const nameSet = names instanceof Set ? names : new Set(names);
  const before = state.animations.length;
  state.animations = state.animations.filter((a) => !nameSet.has(a.name));
  return before - state.animations.length;
};

export const upsertAnimationChannel = (state: SessionState, clip: string, channel: TrackedAnimationChannel) => {
  const anim = state.animations.find((a) => a.name === clip);
  if (!anim) return;
  anim.channels ??= [];
  const existingIndex = anim.channels.findIndex(
    (ch) => ch.bone === channel.bone && ch.channel === channel.channel
  );
  if (existingIndex >= 0) {
    const existing = anim.channels[existingIndex];
    anim.channels[existingIndex] = {
      ...existing,
      ...channel,
      keys: mergeChannelKeys(existing.keys, channel.keys, state.animationTimePolicy)
    };
  } else {
    anim.channels.push(channel);
  }
};

export const upsertAnimationTrigger = (state: SessionState, clip: string, trigger: TrackedAnimationTrigger) => {
  const anim = state.animations.find((a) => a.name === clip);
  if (!anim) return;
  anim.triggers ??= [];
  const existingIndex = anim.triggers.findIndex((tr) => tr.type === trigger.type);
  if (existingIndex >= 0) {
    const existing = anim.triggers[existingIndex];
    anim.triggers[existingIndex] = {
      ...existing,
      ...trigger,
      keys: mergeTriggerKeys(existing.keys, trigger.keys, state.animationTimePolicy)
    };
  } else {
    anim.triggers.push(trigger);
  }
};
