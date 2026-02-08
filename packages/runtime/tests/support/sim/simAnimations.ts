import type {
  AnimationCommand,
  UpdateAnimationCommand,
  DeleteAnimationCommand
} from '../../../src/ports/editor';
import type { ToolError } from '../../../src/types';
import type { BlockbenchSimState } from './simTypes';
import { error } from './simUtils';

export type SimAnimationContext = {
  state: BlockbenchSimState;
};

export const createAnimationOps = (ctx: SimAnimationContext) => {
  const createAnimation = (params: AnimationCommand): ToolError | null => {
    const exists = ctx.state.animations.find((anim) => anim.id === params.id || anim.name === params.name);
    if (exists) return error('invalid_payload', `Animation already exists: ${params.name}`);
    ctx.state.animations.push({
      id: params.id,
      name: params.name,
      length: params.length,
      loop: params.loop,
      fps: params.fps
    });
    return null;
  };

  const updateAnimation = (params: UpdateAnimationCommand): ToolError | null => {
    const target = ctx.state.animations.find((anim) => anim.id === params.id || anim.name === params.name);
    if (!target) return error('invalid_payload', `Animation not found: ${params.name ?? params.id ?? 'unknown'}`);
    if (params.newName) target.name = params.newName;
    if (params.length !== undefined) target.length = params.length;
    if (params.loop !== undefined) target.loop = params.loop;
    if (params.fps !== undefined) target.fps = params.fps;
    return null;
  };

  const deleteAnimation = (params: DeleteAnimationCommand): ToolError | null => {
    const before = ctx.state.animations.length;
    ctx.state.animations = ctx.state.animations.filter(
      (anim) => !((params.id && anim.id === params.id) || (params.name && anim.name === params.name))
    );
    if (before === ctx.state.animations.length) {
      return error('invalid_payload', `Animation not found: ${params.name ?? params.id ?? 'unknown'}`);
    }
    return null;
  };

  return { createAnimation, updateAnimation, deleteAnimation };
};
