import { ToolError } from '../../types';
import {
  AnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
  TriggerKeyframeCommand,
  UpdateAnimationCommand
} from '../../ports/editor';
import { Logger } from '../../logging';
import { AnimationClip } from '../../types/blockbench';
import { assignAnimationLength, readAnimationId, readGlobals, withUndo } from './blockbenchUtils';

export class BlockbenchAnimationAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  createAnimation(params: AnimationCommand): ToolError | null {
    try {
      const { Animation: AnimationCtor } = readGlobals();
      if (typeof AnimationCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Animation API not available' };
      }
      withUndo({ animations: true }, 'Create animation', () => {
        const anim = new AnimationCtor({
          name: params.name,
          length: params.length,
          loop: params.loop ? 'loop' : 'once',
          snapping: params.fps
        });
        if (params.id) anim.bbmcpId = params.id;
        anim.add?.(true);
      });
      this.log.info('animation created', { name: params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'animation create failed';
      this.log.error('animation create error', { message });
      return { code: 'unknown', message };
    }
  }

  updateAnimation(params: UpdateAnimationCommand): ToolError | null {
    try {
      const animations = getAnimations();
      const target = this.findAnimationRef(params.name, params.id, animations);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Animation clip not found: ${label}` };
      }
      if (params.id) target.bbmcpId = params.id;
      withUndo({ animations: true }, 'Update animation', () => {
        if (params.newName && params.newName !== target.name) {
          if (typeof target.rename === 'function') {
            target.rename(params.newName);
          } else {
            target.name = params.newName;
          }
        }
        if (typeof params.length === 'number') {
          assignAnimationLength(target, params.length);
        }
        if (typeof params.loop === 'boolean') {
          if (typeof target.loop === 'string') {
            target.loop = params.loop ? 'loop' : 'once';
          } else {
            target.loop = params.loop;
          }
        }
        if (typeof params.fps === 'number') {
          if (typeof target.snapping !== 'undefined') {
            target.snapping = params.fps;
          } else {
            target.fps = params.fps;
          }
        }
      });
      this.log.info('animation updated', { name: params.name, newName: params.newName });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'animation update failed';
      this.log.error('animation update error', { message });
      return { code: 'unknown', message };
    }
  }

  deleteAnimation(params: DeleteAnimationCommand): ToolError | null {
    try {
      const animations = getAnimations();
      const target = this.findAnimationRef(params.name, params.id, animations);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Animation clip not found: ${label}` };
      }
      withUndo({ animations: true }, 'Delete animation', () => {
        if (typeof target.remove === 'function') {
          target.remove();
          return;
        }
        if (typeof target.delete === 'function') {
          target.delete();
          return;
        }
        if (Array.isArray(animations)) {
          const idx = animations.indexOf(target);
          if (idx >= 0) animations.splice(idx, 1);
        }
      });
      this.log.info('animation deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'animation delete failed';
      this.log.error('animation delete error', { message });
      return { code: 'unknown', message };
    }
  }

  setKeyframes(params: KeyframeCommand): ToolError | null {
    try {
      const { Animator: AnimatorCtor } = readGlobals();
      if (typeof AnimatorCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Animator API not available' };
      }
      withUndo({ animations: true, keyframes: [] }, 'Set keyframes', () => {
        const animations = getAnimations();
        const clip = this.findAnimationRef(params.clip, params.clipId, animations);
        if (!clip) {
          const label = params.clipId ?? params.clip;
          throw new Error(`Animation clip not found: ${label}`);
        }
        if (clip) {
          const animators = (clip.animators ?? {}) as Record<string, unknown>;
          const existing = animators[params.bone] as unknown;
          const animator =
            (existing && typeof existing === 'object' ? existing : null) ??
            new AnimatorCtor(params.bone, clip);
          animators[params.bone] = animator;
          clip.animators = animators;
          params.keys.forEach((k) => {
            const kf = (animator as { createKeyframe?: (channel: string, time: number) => unknown })
              .createKeyframe?.(params.channel, k.time);
            const keyframe = kf as
              | { set?: (key: string, value: unknown) => void; data_points?: unknown; interpolation?: unknown }
              | null
              | undefined;
            if (keyframe?.set) {
              keyframe.set('data_points', k.value);
              if (k.interp) keyframe.set('interpolation', k.interp);
            } else if (keyframe) {
              keyframe.data_points = k.value;
              if (k.interp) keyframe.interpolation = k.interp;
            }
          });
        }
      });
      this.log.info('keyframes set', { clip: params.clip, bone: params.bone, count: params.keys.length });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'keyframe set failed';
      this.log.error('keyframe set error', { message });
      if (message.includes('Animation clip not found')) {
        return { code: 'invalid_payload', message };
      }
      return { code: 'unknown', message };
    }
  }

  setTriggerKeyframes(params: TriggerKeyframeCommand): ToolError | null {
    try {
      const { Animator: AnimatorCtor } = readGlobals();
      if (typeof AnimatorCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Animator API not available' };
      }
      withUndo({ animations: true, keyframes: [] }, 'Set trigger keyframes', () => {
        const animations = getAnimations();
        const clip = this.findAnimationRef(params.clip, params.clipId, animations);
        if (!clip) {
          const label = params.clipId ?? params.clip;
          throw new Error(`Animation clip not found: ${label}`);
        }
        const animator = resolveEffectAnimator(clip, AnimatorCtor);
        params.keys.forEach((k) => {
          const kf = animator?.createKeyframe?.(params.channel, k.time);
          if (!kf) return;
          applyTriggerValue(kf, k.value);
        });
      });
      this.log.info('trigger keyframes set', { clip: params.clip, channel: params.channel, count: params.keys.length });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'trigger keyframe set failed';
      this.log.error('trigger keyframe set error', { message });
      if (message.includes('Animation clip not found')) {
        return { code: 'invalid_payload', message };
      }
      return { code: 'unknown', message };
    }
  }

  private findAnimationRef(name?: string, id?: string, list?: AnimationClip[]): AnimationClip | null {
    const animations = list ?? getAnimations();
    if (id) {
      const byId = animations.find((anim) => readAnimationId(anim) === id);
      if (byId) return byId;
    }
    if (name) return animations.find((anim) => anim?.name === name) ?? null;
    return null;
  }
}

const EFFECT_ANIMATOR_KEYS = ['effects', 'effect', 'timeline', 'events'];

const resolveEffectAnimator = (clip: AnimationClip, AnimatorCtor: unknown): any => {
  const animators = (clip.animators ?? {}) as Record<string, unknown>;
  const existingKey = Object.keys(animators).find((key) =>
    EFFECT_ANIMATOR_KEYS.some((candidate) => key.toLowerCase().includes(candidate))
  );
  if (existingKey) {
    const existing = animators[existingKey];
    if (existing) return existing;
  }
  const ctor = AnimatorCtor as new (name: string, clip: AnimationClip) => unknown;
  const animator = new ctor('effects', clip);
  animators.effects = animator;
  clip.animators = animators;
  return animator;
};

const applyTriggerValue = (keyframe: unknown, value: unknown) => {
  const target = keyframe as Record<string, unknown> & { set?: (key: string, val: unknown) => void };
  if (typeof target.set === 'function') {
    target.set('data_point', value);
    target.set('data_points', value);
    target.set('value', value);
    target.set('data', value);
    return;
  }
  target.data_point = value;
  target.data_points = value;
  target.value = value;
  target.data = value;
};

export const getAnimations = (): AnimationClip[] => {
  const globals = readGlobals();
  if (Array.isArray(globals.Animations)) return globals.Animations;
  if (Array.isArray(globals.Animation?.all)) return globals.Animation.all;
  return [];
};
