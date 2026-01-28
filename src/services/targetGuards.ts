import type { ToolError } from '../types';
import { resolveTargetByIdOrName, resolveTargetLabel } from './lookup';
import { ensureIdNameMatch, ensureIdOrName } from './validation';
import {
  ANIMATION_CLIP_ID_OR_NAME_REQUIRED,
  ANIMATION_CLIP_NOT_FOUND,
  MODEL_BONE_ID_OR_NAME_REQUIRED,
  MODEL_BONE_NOT_FOUND,
  MODEL_CUBE_ID_OR_NAME_REQUIRED,
  MODEL_CUBE_NOT_FOUND,
  TEXTURE_ID_OR_NAME_REQUIRED,
  TEXTURE_NOT_FOUND
} from '../shared/messages';

type TargetNamed = { id?: string | null; name: string };

type ResolveTargetOptions = {
  required: { message: string; fix?: string };
  mismatch: { kind: string; plural: string; idLabel?: string; nameLabel?: string };
  notFound: (label: string) => string;
};

export const resolveTargetOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options: ResolveTargetOptions
): { target?: T; error?: ToolError } => {
  const requiredErr = ensureIdOrName(id, name, options.required);
  if (requiredErr) return { error: requiredErr };
  const mismatchErr = ensureIdNameMatch(items, id, name, options.mismatch);
  if (mismatchErr) return { error: mismatchErr };
  const target = resolveTargetByIdOrName(items, id, name);
  if (!target) {
    return {
      error: { code: 'invalid_payload', message: options.notFound(resolveTargetLabel(id, name)) }
    };
  }
  return { target };
};

export const resolveBoneOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: { idLabel?: string; nameLabel?: string; required?: { message: string; fix?: string } }
): { target?: T; error?: ToolError } =>
  resolveTargetOrError(items, id, name, {
    required: options?.required ?? { message: MODEL_BONE_ID_OR_NAME_REQUIRED },
    mismatch: { kind: 'Bone', plural: 'bones', idLabel: options?.idLabel, nameLabel: options?.nameLabel },
    notFound: MODEL_BONE_NOT_FOUND
  });

export const resolveCubeOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: { idLabel?: string; nameLabel?: string; required?: { message: string; fix?: string } }
): { target?: T; error?: ToolError } =>
  resolveTargetOrError(items, id, name, {
    required: options?.required ?? { message: MODEL_CUBE_ID_OR_NAME_REQUIRED },
    mismatch: { kind: 'Cube', plural: 'cubes', idLabel: options?.idLabel, nameLabel: options?.nameLabel },
    notFound: MODEL_CUBE_NOT_FOUND
  });

export const resolveTextureOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: { idLabel?: string; nameLabel?: string; required?: { message: string; fix?: string } }
): { target?: T; error?: ToolError } =>
  resolveTargetOrError(items, id, name, {
    required: options?.required ?? { message: TEXTURE_ID_OR_NAME_REQUIRED },
    mismatch: { kind: 'Texture', plural: 'textures', idLabel: options?.idLabel, nameLabel: options?.nameLabel },
    notFound: TEXTURE_NOT_FOUND
  });

export const resolveAnimationOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined
): { target?: T; error?: ToolError } =>
  resolveTargetOrError(items, id, name, {
    required: { message: ANIMATION_CLIP_ID_OR_NAME_REQUIRED },
    mismatch: { kind: 'Animation clip', plural: 'clips' },
    notFound: ANIMATION_CLIP_NOT_FOUND
  });
