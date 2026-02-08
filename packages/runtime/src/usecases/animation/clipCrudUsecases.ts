import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { ProjectSession, SessionState } from '../../session';
import type { EditorPort } from '../../ports/editor';
import { ok, fail, type UsecaseResult } from '../result';
import { resolveAnimationTarget } from '../targetResolvers';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from '../crudChecks';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { resolveTargets } from '../targetSelectors';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';
import { validateAnimationFps, validateAnimationLength } from './clipValidation';
import {
  ANIMATION_CLIP_EXISTS,
  ANIMATION_CLIP_ID_OR_NAME_REQUIRED,
  ANIMATION_CLIP_NAME_REQUIRED,
  ANIMATION_CLIP_NOT_FOUND,
  ANIMATION_ID_EXISTS
} from '../../shared/messages';

export type CreateAnimationClipPayload = {
  id?: string;
  name: string;
  length: number;
  loop: boolean;
  fps: number;
};

export type UpdateAnimationClipPayload = {
  id?: string;
  name?: string;
  newName?: string;
  length?: number;
  loop?: boolean;
  fps?: number;
};

export type DeleteAnimationClipPayload = {
  id?: string;
  name?: string;
  ids?: string[];
  names?: string[];
};

export interface AnimationClipCrudDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureAnimationsSupported: () => ToolError | null;
}

export const runCreateAnimationClip = (
  deps: AnimationClipCrudDeps,
  payload: CreateAnimationClipPayload
): UsecaseResult<{ id: string; name: string }> => {
  const supportErr = deps.ensureAnimationsSupported();
  if (supportErr) return fail(supportErr);
  if (!payload.name) {
    return fail({ code: 'invalid_payload', message: ANIMATION_CLIP_NAME_REQUIRED });
  }
  const nameBlankErr = ensureNonBlankString(payload.name, 'Animation name');
  if (nameBlankErr) return fail(nameBlankErr);
  const idBlankErr = ensureNonBlankString(payload.id, 'Animation id');
  if (idBlankErr) return fail(idBlankErr);
  const lengthErr = validateAnimationLength(payload.length, deps.capabilities.limits.maxAnimationSeconds);
  if (lengthErr) return fail(lengthErr);
  const fpsErr = validateAnimationFps(payload.fps);
  if (fpsErr) return fail(fpsErr);
  const snapshot = deps.getSnapshot();
  const nameErr = ensureNameAvailable(snapshot.animations, payload.name, ANIMATION_CLIP_EXISTS);
  if (nameErr) return fail(nameErr);
  const id = resolveEntityId(undefined, payload.id, 'anim');
  const idErr = ensureIdAvailable(snapshot.animations, id, ANIMATION_ID_EXISTS);
  if (idErr) return fail(idErr);
  const err = deps.editor.createAnimation({
    id,
    name: payload.name,
    length: payload.length,
    loop: payload.loop,
    fps: payload.fps
  });
  if (err) return fail(err);
  deps.session.addAnimation({
    id,
    name: payload.name,
    length: payload.length,
    loop: payload.loop,
    fps: payload.fps,
    channels: []
  });
  return ok({ id, name: payload.name });
};

export const runUpdateAnimationClip = (
  deps: AnimationClipCrudDeps,
  payload: UpdateAnimationClipPayload
): UsecaseResult<{ id: string; name: string }> => {
  const supportErr = deps.ensureAnimationsSupported();
  if (supportErr) return fail(supportErr);
  const snapshot = deps.getSnapshot();
  const idBlankErr = ensureNonBlankString(payload.id, 'Animation clip id');
  if (idBlankErr) return fail(idBlankErr);
  const nameBlankErr = ensureNonBlankString(payload.name, 'Animation clip name');
  if (nameBlankErr) return fail(nameBlankErr);
  const newNameBlankErr = ensureNonBlankString(payload.newName, 'Animation clip newName');
  if (newNameBlankErr) return fail(newNameBlankErr);
  const resolved = resolveAnimationTarget(snapshot.animations, payload.id, payload.name);
  if (resolved.error) return fail(resolved.error);
  const target = resolved.target!;
  const targetName = target.name;
  const targetId = resolveEntityId(target.id, payload.id, 'anim');
  const renameErr = ensureRenameAvailable(snapshot.animations, payload.newName, targetName, ANIMATION_CLIP_EXISTS);
  if (renameErr) return fail(renameErr);
  if (payload.length !== undefined) {
    const lengthErr = validateAnimationLength(payload.length, deps.capabilities.limits.maxAnimationSeconds);
    if (lengthErr) return fail(lengthErr);
  }
  if (payload.fps !== undefined) {
    const fpsErr = validateAnimationFps(payload.fps);
    if (fpsErr) return fail(fpsErr);
  }
  const err = deps.editor.updateAnimation({
    id: targetId,
    name: targetName,
    newName: payload.newName,
    length: payload.length,
    loop: payload.loop,
    fps: payload.fps
  });
  if (err) return fail(err);
  deps.session.updateAnimation(targetName, {
    id: targetId,
    newName: payload.newName,
    length: payload.length,
    loop: payload.loop,
    fps: payload.fps
  });
  return ok({ id: targetId, name: payload.newName ?? targetName });
};

export const runDeleteAnimationClip = (
  deps: AnimationClipCrudDeps,
  payload: DeleteAnimationClipPayload
): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> => {
  const supportErr = deps.ensureAnimationsSupported();
  if (supportErr) return fail(supportErr);
  const snapshot = deps.getSnapshot();
  const resolvedTargets = resolveTargets(
    snapshot.animations,
    payload,
    { id: 'Animation clip id', name: 'Animation clip name' },
    { message: ANIMATION_CLIP_ID_OR_NAME_REQUIRED },
    {
      required: { message: ANIMATION_CLIP_ID_OR_NAME_REQUIRED },
      mismatch: { kind: 'Animation clip', plural: 'clips', message: buildIdNameMismatchMessage },
      notFound: ANIMATION_CLIP_NOT_FOUND
    }
  );
  if (!resolvedTargets.ok) return fail(resolvedTargets.error);
  const targets = resolvedTargets.value;
  for (const target of targets) {
    const err = deps.editor.deleteAnimation({ id: target.id ?? undefined, name: target.name });
    if (err) return fail(err);
  }
  const nameSet = new Set(targets.map((target) => target.name));
  deps.session.removeAnimations(nameSet);
  const deleted = targets.map((target) => ({ id: target.id ?? undefined, name: target.name }));
  const primary = deleted[0] ?? { id: targets[0]?.id ?? undefined, name: targets[0]?.name ?? 'unknown' };
  return ok({ id: primary.id ?? primary.name, name: primary.name, deleted });
};

