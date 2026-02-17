import type { ToolError } from '@ashfox/contracts/types/internal';
import type {
  AnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
  TriggerKeyframeCommand,
  UpdateAnimationCommand
} from '../../../ports/editor';
import { errorMessage, type Logger } from '../../../logging';
import { toolError } from '../../../shared/tooling/toolResponse';
import type { AnimationClip, AnimatorInstance, GroupInstance } from '../../../types/blockbench';
import {
  ADAPTER_ANIMATION_API_UNAVAILABLE,
  ADAPTER_ANIMATOR_API_UNAVAILABLE,
  ANIMATION_CLIP_NOT_FOUND,
  MODEL_BONE_NOT_FOUND
} from '../../../shared/messages';
import {
  assignAnimationLength,
  readAnimationId,
  readGlobals,
  removeEntity,
  renameEntity,
  withUndo
} from '../blockbenchUtils';
import { withMappedAdapterError } from '../adapterErrors';
import { findGroup } from '../outlinerLookup';
import {
  type AnimatorLike,
  applyKeyframeValue,
  applyTriggerValue,
  createTransformKeyframe,
  findExistingKeyframes,
  lastKeyframeTime,
  lastTriggerKeyframeTime,
  resolveAnimationChannelKey,
  sanitizeAnimatorChannel,
  sanitizeAnimatorChannels,
  sanitizeAnimatorKeyframes,
  sanitizeClipKeyframes
} from './animationKeyframeHelpers';
import { refreshAnimationViewport } from './animationViewport';

type BoneAnimatorConstructor = new (uuid: string, clip: AnimationClip) => AnimatorLike;
type EffectAnimatorConstructor = new (clip: AnimationClip) => AnimatorLike;

const runAnimationCommand = (
  log: Logger,
  options: { message: string; logLabel: string; context: string },
  run: () => ToolError | null
): ToolError | null => {
  return withMappedAdapterError(
    log,
    {
      context: options.context,
      fallbackMessage: options.message,
      logLabel: options.logLabel
    },
    run,
    (error) => error
  );
};

export const runCreateAnimation = (log: Logger, params: AnimationCommand): ToolError | null => {
  return runAnimationCommand(
    log,
    {
      message: 'animation create failed',
      logLabel: 'animation create error',
      context: 'animation_create'
    },
    () => {
      const { Animation: AnimationCtor } = readGlobals();
      if (typeof AnimationCtor === 'undefined') {
        return { code: 'invalid_state', message: ADAPTER_ANIMATION_API_UNAVAILABLE };
      }
    withUndo({ animations: true }, 'Create animation', () => {
      const anim = new AnimationCtor({
        name: params.name,
        length: params.length,
        loop: params.loop ? 'loop' : 'once',
        snapping: params.fps
      });
      if (params.id) anim.ashfoxId = params.id;
      anim.add?.(true);
    });
    log.info('animation created', { name: params.name });
    return null;
    }
  );
};

export const runUpdateAnimation = (log: Logger, params: UpdateAnimationCommand): ToolError | null => {
  return runAnimationCommand(
    log,
    {
      message: 'animation update failed',
      logLabel: 'animation update error',
      context: 'animation_update'
    },
    () => {
      const animations = getAnimations();
      const target = findAnimationRef(params.name, params.id, animations);
      if (!target) {
      const label = params.id ?? params.name ?? 'unknown';
      return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
    }
    if (params.id) target.ashfoxId = params.id;
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
    log.info('animation updated', { name: params.name, newName: params.newName });
    return null;
    }
  );
};

export const runDeleteAnimation = (log: Logger, params: DeleteAnimationCommand): ToolError | null => {
  return runAnimationCommand(
    log,
    {
      message: 'animation delete failed',
      logLabel: 'animation delete error',
      context: 'animation_delete'
    },
    () => {
      const animations = getAnimations();
      const target = findAnimationRef(params.name, params.id, animations);
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
    log.info('animation deleted', { name: target?.name ?? params.name });
    return null;
    }
  );
};

export const runSetKeyframes = (log: Logger, params: KeyframeCommand): ToolError | null => {
  return runAnimationCommand(
    log,
    {
      message: 'keyframe set failed',
      logLabel: 'keyframe set error',
      context: 'keyframe_set'
    },
    () => {
      const animations = getAnimations();
      const clip = findAnimationRef(params.clip, params.clipId, animations);
      if (!clip) {
      const label = params.clipId ?? params.clip;
      return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
    }
    const group = findGroup(params.bone);
    if (!group) {
      return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(params.bone) };
    }
    const canResolve =
      typeof clip.getBoneAnimator === 'function' ||
      typeof (group as { constructor?: { animator?: unknown } }).constructor?.animator === 'function';
    if (!canResolve) {
      return { code: 'invalid_state', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
    }
    let resolveError: ToolError | null = null;
    withUndo({ animations: true, keyframes: [] }, 'Set keyframes', () => {
      if (clip) {
        clip.select?.();
        const animator = resolveBoneAnimator(clip, group);
        if (!animator) {
          resolveError = { code: 'invalid_state', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
          return;
        }
        const channelKey = resolveAnimationChannelKey(params.channel);
        sanitizeClipKeyframes(clip);
        sanitizeAnimatorKeyframes(animator);
        sanitizeAnimatorChannels(animator, ['rotation', 'position', 'scale']);
        for (const k of params.keys) {
          const meta = {
            interp: k.interp,
            easing: k.easing,
            easingArgs: k.easingArgs,
            pre: k.pre,
            post: k.post,
            bezier: k.bezier
          };
          const matches = findExistingKeyframes(animator, params.channel, k.time, params.timePolicy);
          if (matches.length > 0) {
            matches.forEach((keyframe) => applyKeyframeValue(keyframe, k.value, meta));
            continue;
          }
          const result = createTransformKeyframe(animator, channelKey, k.time, k.value, meta);
          if (result.error) {
            resolveError = toolError('unknown', errorMessage(result.error, 'keyframe create failed'), {
              reason: 'adapter_exception',
              context: 'keyframe_set'
            });
            break;
          }
          if (!result.keyframe) continue;
          applyKeyframeValue(result.keyframe, k.value, meta);
        }
      }
    });
    if (resolveError) return resolveError;
    refreshAnimationViewport(log, clip, lastKeyframeTime(params.keys));
    log.info('keyframes set', { clip: params.clip, bone: params.bone, count: params.keys.length });
    return null;
    }
  );
};

export const runSetTriggerKeyframes = (log: Logger, params: TriggerKeyframeCommand): ToolError | null => {
  return runAnimationCommand(
    log,
    {
      message: 'trigger keyframe set failed',
      logLabel: 'trigger keyframe set error',
      context: 'trigger_keyframe_set'
    },
    () => {
      const globals = readGlobals();
      const animations = getAnimations();
      const clip = findAnimationRef(params.clip, params.clipId, animations);
    if (!clip) {
      const label = params.clipId ?? params.clip;
      return { code: 'invalid_payload', message: ANIMATION_CLIP_NOT_FOUND(label) };
    }
    const canResolve =
      hasEffectAnimator(clip) || typeof globals.EffectAnimator === 'function';
    if (!canResolve) {
      return { code: 'invalid_state', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
    }
    let resolveError: ToolError | null = null;
    withUndo({ animations: true, keyframes: [] }, 'Set trigger keyframes', () => {
      clip.select?.();
      const animator = resolveEffectAnimator(clip, globals);
      if (!animator) {
        resolveError = { code: 'invalid_state', message: ADAPTER_ANIMATOR_API_UNAVAILABLE };
        return;
      }
      sanitizeClipKeyframes(clip);
      sanitizeAnimatorKeyframes(animator);
      sanitizeAnimatorChannel(animator, params.channel);
      params.keys.forEach((k) => {
        const matches = findExistingKeyframes(animator, params.channel, k.time, params.timePolicy);
        if (matches.length > 0) {
          matches.forEach((keyframe) => applyTriggerValue(keyframe, k.value));
          return;
        }
        const kf = animator?.createKeyframe?.(undefined, k.time, params.channel, false, false);
        if (!kf) return;
        applyTriggerValue(kf, k.value);
      });
    });
    if (resolveError) return resolveError;
    refreshAnimationViewport(log, clip, lastTriggerKeyframeTime(params.keys));
    log.info('trigger keyframes set', { clip: params.clip, channel: params.channel, count: params.keys.length });
    return null;
    }
  );
};

const findAnimationRef = (name?: string, id?: string, list?: AnimationClip[]): AnimationClip | null => {
  const animations = list ?? getAnimations();
  if (id) {
    const byId = animations.find((anim) => readAnimationId(anim) === id);
    if (byId) return byId;
  }
  if (name) return animations.find((anim) => anim?.name === name) ?? null;
  return null;
};

const EFFECT_ANIMATOR_KEYS = ['effects', 'effect', 'timeline', 'events'];

const resolveEffectAnimator = (clip: AnimationClip, globals: ReturnType<typeof readGlobals>): AnimatorLike | null => {
  const animators = (clip.animators ?? {}) as Record<string, unknown>;
  const existingKey = Object.keys(animators).find((key) =>
    EFFECT_ANIMATOR_KEYS.some((candidate) => key.toLowerCase().includes(candidate))
  );
  if (existingKey) {
    const existing = animators[existingKey];
    if (existing && typeof existing === 'object') return existing as AnimatorLike;
  }
  const ctor = globals.EffectAnimator as EffectAnimatorConstructor | undefined;
  if (typeof ctor !== 'function') return null;
  const animator = new ctor(clip);
  animators.effects = animator;
  clip.animators = animators;
  return animator;
};

const resolveBoneAnimator = (clip: AnimationClip, group: GroupInstance): AnimatorLike | null => {
  if (typeof clip.getBoneAnimator === 'function') {
    const animator = clip.getBoneAnimator(group) as AnimatorInstance | undefined;
    if (animator && typeof animator === 'object') return animator as AnimatorLike;
  }
  const ctor = (group as { constructor?: { animator?: unknown } }).constructor?.animator;
  if (typeof ctor !== 'function') return null;
  const uuid = group.uuid ?? group.id ?? group.name ?? 'bone';
  const animator = new (ctor as BoneAnimatorConstructor)(uuid, clip);
  const animators = (clip.animators ?? {}) as Record<string, unknown>;
  animators[String(uuid)] = animator;
  clip.animators = animators;
  return animator as AnimatorLike;
};

const hasEffectAnimator = (clip: AnimationClip): boolean => {
  const animators = (clip.animators ?? {}) as Record<string, unknown>;
  return Object.keys(animators).some((key) =>
    EFFECT_ANIMATOR_KEYS.some((candidate) => key.toLowerCase().includes(candidate))
  );
};

export const getAnimations = (): AnimationClip[] => {
  const globals = readGlobals();
  if (Array.isArray(globals.Animations)) return globals.Animations;
  if (Array.isArray(globals.Animation?.all)) return globals.Animation.all;
  return [];
};
