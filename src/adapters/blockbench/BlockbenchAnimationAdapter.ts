import { ToolError } from '../../types';
import {
  AnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
  TriggerKeyframeCommand,
  UpdateAnimationCommand
} from '../../ports/editor';
import { errorMessage, Logger } from '../../logging';
import { toolError } from '../../services/toolResponse';
import { AnimationClip } from '../../types/blockbench';
import {
  ADAPTER_ANIMATION_API_UNAVAILABLE,
  ADAPTER_ANIMATOR_API_UNAVAILABLE,
  ANIMATION_CLIP_NOT_FOUND
} from '../../shared/messages';
import {
  assignAnimationLength,
  readAnimationId,
  readGlobals,
  removeEntity,
  renameEntity,
  withUndo
} from './blockbenchUtils';

type KeyframeLike = {
  set?: (key: string, value: unknown) => void;
  data_point?: unknown;
  data_points?: unknown;
  value?: unknown;
  data?: unknown;
  interpolation?: unknown;
};

type AnimatorLike = {
  createKeyframe?: (channel: string, time: number) => KeyframeLike | undefined;
};

type AnimatorConstructor = new (name: string, clip: AnimationClip) => AnimatorLike;

export class BlockbenchAnimationAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  createAnimation(params: AnimationCommand): ToolError | null {
    try {
      const { Animation: AnimationCtor } = readGlobals();
      if (typeof AnimationCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_ANIMATION_API_UNAVAILABLE };
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
      const message = errorMessage(err, 'animation create failed');
      this.log.error('animation create error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'animation_create' });
    }
  }

  updateAnimation(params: UpdateAnimationCommand): ToolError | null {
    try {
      const animations = getAnimations();
      const target = this.findAnimationRef(params.name, params.id, animations);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
      }
      if (params.id) target.bbmcpId = params.id;
      withUndo({ animations: true }, 'Update animation', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
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
      const message = errorMessage(err, 'animation update failed');
      this.log.error('animation update error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'animation_update' });
    }
  }

  deleteAnimation(params: DeleteAnimationCommand): ToolError | null {
    try {
      const animations = getAnimations();
      const target = this.findAnimationRef(params.name, params.id, animations);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
      }
      withUndo({ animations: true }, 'Delete animation', () => {
        if (removeEntity(target)) return;
        if (Array.isArray(animations)) {
          const idx = animations.indexOf(target);
          if (idx >= 0) animations.splice(idx, 1);
        }
      });
      this.log.info('animation deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'animation delete failed');
      this.log.error('animation delete error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'animation_delete' });
    }
  }

  setKeyframes(params: KeyframeCommand): ToolError | null {
    try {
      const { Animator: AnimatorCtor } = readGlobals();
      if (typeof AnimatorCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
      }
      const animations = getAnimations();
      const clip = this.findAnimationRef(params.clip, params.clipId, animations);
      if (!clip) {
        const label = params.clipId ?? params.clip;
        return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
      }
      withUndo({ animations: true, keyframes: [] }, 'Set keyframes', () => {
        if (clip) {
          const animators = (clip.animators ?? {}) as Record<string, unknown>;
          const existing = animators[params.bone] as unknown;
          const animator = resolveAnimator(existing, AnimatorCtor, params.bone, clip);
          animators[params.bone] = animator;
          clip.animators = animators;
          params.keys.forEach((k) => {
            const keyframe = animator.createKeyframe?.(params.channel, k.time);
            if (!keyframe) return;
            applyKeyframeValue(keyframe, k.value, k.interp);
          });
        }
      });
      this.log.info('keyframes set', { clip: params.clip, bone: params.bone, count: params.keys.length });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'keyframe set failed');
      this.log.error('keyframe set error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'keyframe_set' });
    }
  }

  setTriggerKeyframes(params: TriggerKeyframeCommand): ToolError | null {
    try {
      const { Animator: AnimatorCtor } = readGlobals();
      if (typeof AnimatorCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
      }
      const animations = getAnimations();
      const clip = this.findAnimationRef(params.clip, params.clipId, animations);
      if (!clip) {
        const label = params.clipId ?? params.clip;
        return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
      }
      withUndo({ animations: true, keyframes: [] }, 'Set trigger keyframes', () => {
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
      const message = errorMessage(err, 'trigger keyframe set failed');
      this.log.error('trigger keyframe set error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'trigger_keyframe_set' });
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

const resolveEffectAnimator = (clip: AnimationClip, AnimatorCtor: unknown): AnimatorLike => {
  const animators = (clip.animators ?? {}) as Record<string, unknown>;
  const existingKey = Object.keys(animators).find((key) =>
    EFFECT_ANIMATOR_KEYS.some((candidate) => key.toLowerCase().includes(candidate))
  );
  if (existingKey) {
    const existing = animators[existingKey];
    if (existing && typeof existing === 'object') return existing as AnimatorLike;
  }
  const ctor = AnimatorCtor as AnimatorConstructor;
  const animator = new ctor('effects', clip);
  animators.effects = animator;
  clip.animators = animators;
  return animator;
};

const resolveAnimator = (
  existing: unknown,
  AnimatorCtor: unknown,
  name: string,
  clip: AnimationClip
): AnimatorLike => {
  if (existing && typeof existing === 'object') return existing as AnimatorLike;
  const ctor = AnimatorCtor as AnimatorConstructor;
  return new ctor(name, clip);
};

const applyKeyframeValue = (keyframe: KeyframeLike, value: unknown, interp?: string) => {
  if (keyframe.set) {
    keyframe.set('data_points', value);
    if (interp) keyframe.set('interpolation', interp);
    return;
  }
  keyframe.data_points = value;
  if (interp) keyframe.interpolation = interp;
};

const applyTriggerValue = (keyframe: KeyframeLike, value: unknown) => {
  if (keyframe.set) {
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

export const getAnimations = (): AnimationClip[] => {
  const globals = readGlobals();
  if (Array.isArray(globals.Animations)) return globals.Animations;
  if (Array.isArray(globals.Animation?.all)) return globals.Animation.all;
  return [];
};
