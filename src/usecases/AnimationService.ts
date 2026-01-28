import type { Capabilities, ToolError } from '../types';
import { ProjectSession, SessionState } from '../session';
import { EditorPort, TriggerChannel } from '../ports/editor';
import { ok, fail, UsecaseResult } from './result';
import { createId } from '../services/id';
import { resolveAnimationOrError } from '../services/targetGuards';
import { ensureNonBlankString } from '../services/validation';
import { ensureActiveAndRevision } from './guards';
import {
  ANIMATION_CLIP_EXISTS,
  ANIMATION_CLIP_NAME_REQUIRED,
  ANIMATION_FPS_POSITIVE,
  ANIMATION_ID_EXISTS,
  ANIMATION_LENGTH_EXCEEDS_MAX,
  ANIMATION_LENGTH_POSITIVE,
  ANIMATION_UNSUPPORTED_FORMAT
} from '../shared/messages';

export interface AnimationServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  capabilities: Capabilities;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class AnimationService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: AnimationServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  createAnimationClip(payload: {
    id?: string;
    name: string;
    length: number;
    loop: boolean;
    fps: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const supportErr = this.ensureAnimationsSupported();
    if (supportErr) return fail(supportErr);
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: ANIMATION_CLIP_NAME_REQUIRED });
    }
    const nameBlankErr = ensureNonBlankString(payload.name, 'Animation name');
    if (nameBlankErr) return fail(nameBlankErr);
    const idBlankErr = ensureNonBlankString(payload.id, 'Animation id');
    if (idBlankErr) return fail(idBlankErr);
    if (!Number.isFinite(payload.length) || payload.length <= 0) {
      return fail({ code: 'invalid_payload', message: ANIMATION_LENGTH_POSITIVE });
    }
    if (!Number.isFinite(payload.fps) || payload.fps <= 0) {
      return fail({ code: 'invalid_payload', message: ANIMATION_FPS_POSITIVE });
    }
    if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
      return fail({
        code: 'invalid_payload',
        message: ANIMATION_LENGTH_EXCEEDS_MAX(this.capabilities.limits.maxAnimationSeconds)
      });
    }
    const snapshot = this.getSnapshot();
    const nameConflict = snapshot.animations.some((a) => a.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: ANIMATION_CLIP_EXISTS(payload.name) });
    }
    const id = payload.id ?? createId('anim');
    const idConflict = snapshot.animations.some((a) => a.id && a.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: ANIMATION_ID_EXISTS(id) });
    }
    const err = this.editor.createAnimation({
      id,
      name: payload.name,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    if (err) return fail(err);
    this.session.addAnimation({
      id,
      name: payload.name,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps,
      channels: []
    });
    return ok({ id, name: payload.name });
  }

  updateAnimationClip(payload: {
    id?: string;
    name?: string;
    newName?: string;
    length?: number;
    loop?: boolean;
    fps?: number;
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const supportErr = this.ensureAnimationsSupported();
    if (supportErr) return fail(supportErr);
    const snapshot = this.getSnapshot();
    const idBlankErr = ensureNonBlankString(payload.id, 'Animation clip id');
    if (idBlankErr) return fail(idBlankErr);
    const nameBlankErr = ensureNonBlankString(payload.name, 'Animation clip name');
    if (nameBlankErr) return fail(nameBlankErr);
    const newNameBlankErr = ensureNonBlankString(payload.newName, 'Animation clip newName');
    if (newNameBlankErr) return fail(newNameBlankErr);
    const resolved = resolveAnimationOrError(snapshot.animations, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('anim');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.animations.some((a) => a.name === payload.newName && a.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: ANIMATION_CLIP_EXISTS(payload.newName) });
      }
    }
    if (payload.length !== undefined) {
      if (!Number.isFinite(payload.length) || payload.length <= 0) {
        return fail({ code: 'invalid_payload', message: ANIMATION_LENGTH_POSITIVE });
      }
      if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
        return fail({
          code: 'invalid_payload',
          message: ANIMATION_LENGTH_EXCEEDS_MAX(this.capabilities.limits.maxAnimationSeconds)
        });
      }
    }
    if (payload.fps !== undefined && (!Number.isFinite(payload.fps) || payload.fps <= 0)) {
      return fail({ code: 'invalid_payload', message: ANIMATION_FPS_POSITIVE });
    }
    const err = this.editor.updateAnimation({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    if (err) return fail(err);
    this.session.updateAnimation(targetName, {
      id: targetId,
      newName: payload.newName,
      length: payload.length,
      loop: payload.loop,
      fps: payload.fps
    });
    return ok({ id: targetId, name: payload.newName ?? targetName });
  }

  deleteAnimationClip(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const supportErr = this.ensureAnimationsSupported();
    if (supportErr) return fail(supportErr);
    const snapshot = this.getSnapshot();
    const idBlankErr = ensureNonBlankString(payload.id, 'Animation clip id');
    if (idBlankErr) return fail(idBlankErr);
    const nameBlankErr = ensureNonBlankString(payload.name, 'Animation clip name');
    if (nameBlankErr) return fail(nameBlankErr);
    const resolved = resolveAnimationOrError(snapshot.animations, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const err = this.editor.deleteAnimation({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeAnimations([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  setKeyframes(payload: {
    clipId?: string;
    clip: string;
    bone: string;
    channel: 'rot' | 'pos' | 'scale';
    keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; bone: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const selectorErr = this.ensureClipSelector(payload.clipId, payload.clip);
    if (selectorErr) return fail(selectorErr);
    const boneBlankErr = ensureNonBlankString(payload.bone, 'Animation bone');
    if (boneBlankErr) return fail(boneBlankErr);
    const resolved = this.resolveClipTarget(snapshot, payload.clipId, payload.clip);
    if (!resolved.ok) return resolved;
    const anim = resolved.value;
    const err = this.editor.setKeyframes({
      clipId: anim.id,
      clip: anim.name,
      bone: payload.bone,
      channel: payload.channel,
      keys: payload.keys
    });
    if (err) return fail(err);
    this.session.upsertAnimationChannel(anim.name, {
      bone: payload.bone,
      channel: payload.channel,
      keys: payload.keys
    });
    return ok({ clip: anim.name, clipId: anim.id ?? undefined, bone: payload.bone });
  }

  setTriggerKeyframes(payload: {
    clipId?: string;
    clip: string;
    channel: TriggerChannel;
    keys: { time: number; value: string | string[] | Record<string, unknown> }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const selectorErr = this.ensureClipSelector(payload.clipId, payload.clip);
    if (selectorErr) return fail(selectorErr);
    const resolved = this.resolveClipTarget(snapshot, payload.clipId, payload.clip);
    if (!resolved.ok) return resolved;
    const anim = resolved.value;
    const err = this.editor.setTriggerKeyframes({
      clipId: anim.id,
      clip: anim.name,
      channel: payload.channel,
      keys: payload.keys
    });
    if (err) return fail(err);
    this.session.upsertAnimationTrigger(anim.name, {
      type: payload.channel,
      keys: payload.keys
    });
    return ok({ clip: anim.name, clipId: anim.id ?? undefined, channel: payload.channel });
  }

  private resolveClipTarget(
    snapshot: SessionState,
    clipId: string | undefined,
    clip: string | undefined
  ): UsecaseResult<SessionState['animations'][number]> {
    const resolved = resolveAnimationOrError(snapshot.animations, clipId, clip);
    if (resolved.error) return fail(resolved.error);
    return ok(resolved.target!);
  }

  private ensureAnimationsSupported(): ToolError | null {
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return { code: 'unsupported_format', message: ANIMATION_UNSUPPORTED_FORMAT };
    }
    return null;
  }

  private ensureClipSelector(clipId?: string, clip?: string): ToolError | null {
    const clipIdBlankErr = ensureNonBlankString(clipId, 'Animation clip id');
    if (clipIdBlankErr) return clipIdBlankErr;
    const clipBlankErr = ensureNonBlankString(clip, 'Animation clip name');
    if (clipBlankErr) return clipBlankErr;
    return null;
  }
}
