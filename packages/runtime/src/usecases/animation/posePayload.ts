import { ensureNonBlankString } from '../../shared/payloadValidation';
import {
  ANIMATION_POSE_BONES_REQUIRED,
  ANIMATION_POSE_CHANNEL_REQUIRED,
  ANIMATION_POSE_VALUE_INVALID,
  MODEL_BONE_NOT_FOUND
} from '../../shared/messages';
import { fail, ok, type UsecaseResult } from '../result';

export type PoseInterp = 'linear' | 'step' | 'catmullrom';

export type PoseBoneInput = {
  name: string;
  rot?: [number, number, number];
  pos?: [number, number, number];
  scale?: [number, number, number];
  interp?: PoseInterp;
};

export type PoseUpdate = {
  bone: string;
  channel: 'rot' | 'pos' | 'scale';
  value: [number, number, number];
  interp?: PoseInterp;
};

export const DEFAULT_ANIMATION_FPS = 20;

export const resolvePoseFps = (anim: { fps?: number }): number => {
  const fps = Number(anim.fps);
  if (Number.isFinite(fps) && fps > 0) return fps;
  return DEFAULT_ANIMATION_FPS;
};

export const buildPoseUpdates = (
  bones: PoseBoneInput[],
  boneNames: ReadonlySet<string>,
  fallbackInterp?: PoseInterp
): UsecaseResult<PoseUpdate[]> => {
  if (!Array.isArray(bones) || bones.length === 0) {
    return fail({ code: 'invalid_payload', message: ANIMATION_POSE_BONES_REQUIRED });
  }

  const updates: PoseUpdate[] = [];
  for (const entry of bones) {
    const boneBlankErr = ensureNonBlankString(entry?.name, 'Animation bone');
    if (boneBlankErr) return fail(boneBlankErr);
    if (!boneNames.has(entry.name)) {
      return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(entry.name) });
    }

    const channels = [
      { key: 'rot' as const, value: entry.rot },
      { key: 'pos' as const, value: entry.pos },
      { key: 'scale' as const, value: entry.scale }
    ];
    if (!channels.some((channel) => channel.value !== undefined)) {
      return fail({ code: 'invalid_payload', message: ANIMATION_POSE_CHANNEL_REQUIRED });
    }

    for (const channel of channels) {
      if (!channel.value) continue;
      const vector = normalizePoseVector(channel.value);
      if (!vector) {
        return fail({ code: 'invalid_payload', message: ANIMATION_POSE_VALUE_INVALID });
      }
      updates.push({
        bone: entry.name,
        channel: channel.key,
        value: vector,
        interp: entry.interp ?? fallbackInterp
      });
    }
  }

  return ok(updates);
};

const normalizePoseVector = (value: [number, number, number] | undefined): [number, number, number] | null => {
  if (!Array.isArray(value) || value.length < 3) return null;
  const next: [number, number, number] = [Number(value[0]), Number(value[1]), Number(value[2])];
  if (next.some((entry) => !Number.isFinite(entry))) return null;
  return next;
};
