import { ToolError } from '../../types';
import {
  AnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
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
          const animator = clip.animators?.[params.bone] || new AnimatorCtor(params.bone, clip);
          clip.animators ??= {};
          clip.animators[params.bone] = animator;
          params.keys.forEach((k) => {
            const kf = animator?.createKeyframe?.(params.channel, k.time);
            if (kf?.set) {
              kf.set('data_points', k.value);
              if (k.interp) kf.set('interpolation', k.interp);
            } else if (kf) {
              kf.data_points = k.value;
              if (k.interp) kf.interpolation = k.interp;
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

export const getAnimations = (): AnimationClip[] => {
  const globals = readGlobals();
  if (Array.isArray(globals.Animations)) return globals.Animations;
  if (Array.isArray(globals.Animation?.all)) return globals.Animation.all;
  return [];
};
