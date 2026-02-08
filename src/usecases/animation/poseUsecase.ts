import type { ToolError } from '@ashfox/contracts/types/internal';
import type { ProjectSession, SessionState } from '../../session';
import type { EditorPort } from '../../ports/editor';
import { fail, ok, type UsecaseResult } from '../result';
import { buildPoseUpdates, resolvePoseFps, type PoseInterp, type PoseBoneInput } from './posePayload';
import { ANIMATION_FRAME_INVALID } from '../../shared/messages';
import { ensureClipSelector, resolveClipTarget } from './clipSelectors';

export type SetFramePosePayload = {
  clipId?: string;
  clip: string;
  frame: number;
  bones: PoseBoneInput[];
  interp?: PoseInterp;
};

export interface PoseUsecaseDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureAnimationsSupported: () => ToolError | null;
}

export const runSetFramePose = (
  deps: PoseUsecaseDeps,
  payload: SetFramePosePayload
): UsecaseResult<{
  clip: string;
  clipId?: string;
  frame: number;
  time: number;
  bones: number;
  channels: number;
}> => {
  const supportErr = deps.ensureAnimationsSupported();
  if (supportErr) return fail(supportErr);
  const snapshot = deps.getSnapshot();
  const selectorErr = ensureClipSelector(payload.clipId, payload.clip);
  if (selectorErr) return fail(selectorErr);
  if (!Number.isFinite(payload.frame) || payload.frame < 0) {
    return fail({ code: 'invalid_payload', message: ANIMATION_FRAME_INVALID });
  }
  const resolved = resolveClipTarget(snapshot, payload.clipId, payload.clip);
  if (!resolved.ok) return resolved;
  const anim = resolved.value;
  const fps = resolvePoseFps(anim);
  const time = payload.frame / fps;
  const boneNames = new Set(snapshot.bones.map((bone) => bone.name));
  const updatesRes = buildPoseUpdates(payload.bones, boneNames, payload.interp);
  if (!updatesRes.ok) return fail(updatesRes.error);
  const updates = updatesRes.value;
  let applied = 0;
  for (const update of updates) {
    const err = deps.editor.setKeyframes({
      clipId: anim.id,
      clip: anim.name,
      bone: update.bone,
      channel: update.channel,
      keys: [{ time, value: update.value, interp: update.interp }],
      timePolicy: snapshot.animationTimePolicy
    });
    if (err) return fail(err);
    deps.session.upsertAnimationChannel(anim.name, {
      bone: update.bone,
      channel: update.channel,
      keys: [{ time, value: update.value, interp: update.interp }]
    });
    applied += 1;
  }
  return ok({
    clip: anim.name,
    clipId: anim.id ?? undefined,
    frame: payload.frame,
    time,
    bones: payload.bones.length,
    channels: applied
  });
};

