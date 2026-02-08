import { buildIdNameMismatchMessage } from '../shared/targetMessages';
import type { ToolError } from '../types/internal';
import {
  ANIMATION_CLIP_ID_OR_NAME_REQUIRED,
  ANIMATION_CLIP_NOT_FOUND,
  MODEL_BONE_ID_OR_NAME_REQUIRED,
  MODEL_BONE_NOT_FOUND,
  MODEL_CUBE_ID_OR_NAME_REQUIRED,
  MODEL_CUBE_NOT_FOUND,
  MODEL_MESH_ID_OR_NAME_REQUIRED,
  MODEL_MESH_NOT_FOUND,
  TEXTURE_ID_OR_NAME_REQUIRED,
  TEXTURE_ID_OR_NAME_REQUIRED_FIX,
  TEXTURE_NOT_FOUND
} from '../shared/messages';
import { resolveTargetsFromSelectors } from './targetSelectors';

type TargetNamed = { id?: string | null; name: string };

type ResolveOptions = {
  idLabel?: string;
  nameLabel?: string;
  required?: { message: string; fix?: string };
};

export const resolveAnimationTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined
) =>
  resolveSingleTarget(items, id, name, {
    required: { message: ANIMATION_CLIP_ID_OR_NAME_REQUIRED },
    mismatch: { kind: 'Animation clip', plural: 'clips', message: buildIdNameMismatchMessage },
    notFound: ANIMATION_CLIP_NOT_FOUND
  });

export const resolveBoneTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: ResolveOptions
) =>
  resolveSingleTarget(items, id, name, {
    required: options?.required ?? { message: MODEL_BONE_ID_OR_NAME_REQUIRED },
    mismatch: {
      kind: 'Bone',
      plural: 'bones',
      idLabel: options?.idLabel,
      nameLabel: options?.nameLabel,
      message: buildIdNameMismatchMessage
    },
    notFound: MODEL_BONE_NOT_FOUND
  });

export const resolveCubeTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: ResolveOptions
) =>
  resolveSingleTarget(items, id, name, {
    required: options?.required ?? { message: MODEL_CUBE_ID_OR_NAME_REQUIRED },
    mismatch: {
      kind: 'Cube',
      plural: 'cubes',
      idLabel: options?.idLabel,
      nameLabel: options?.nameLabel,
      message: buildIdNameMismatchMessage
    },
    notFound: MODEL_CUBE_NOT_FOUND
  });

export const resolveMeshTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: ResolveOptions
) =>
  resolveSingleTarget(items, id, name, {
    required: options?.required ?? { message: MODEL_MESH_ID_OR_NAME_REQUIRED },
    mismatch: {
      kind: 'Mesh',
      plural: 'meshes',
      idLabel: options?.idLabel,
      nameLabel: options?.nameLabel,
      message: buildIdNameMismatchMessage
    },
    notFound: MODEL_MESH_NOT_FOUND
  });

export const resolveTextureTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options?: ResolveOptions
) =>
  resolveSingleTarget(items, id, name, {
    required:
      options?.required ??
      ({
        message: TEXTURE_ID_OR_NAME_REQUIRED,
        fix: TEXTURE_ID_OR_NAME_REQUIRED_FIX
      } as { message: string; fix?: string }),
    mismatch: {
      kind: 'Texture',
      plural: 'textures',
      idLabel: options?.idLabel,
      nameLabel: options?.nameLabel,
      message: buildIdNameMismatchMessage
    },
    notFound: TEXTURE_NOT_FOUND
  });

const resolveSingleTarget = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options: {
    required: { message: string; fix?: string };
    mismatch?: {
      kind: string;
      plural: string;
      idLabel?: string;
      nameLabel?: string;
      message?: (args: {
        kind: string;
        plural: string;
        idLabel: string;
        nameLabel: string;
        id: string;
        name: string;
      }) => string;
    };
    notFound: (label: string) => string;
  }
): { target?: T; error?: ToolError } => {
  const resolved = resolveTargetsFromSelectors(items, [{ id, name }], options);
  if (!resolved.ok) return { error: resolved.error };
  return { target: resolved.value[0] };
};

