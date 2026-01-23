import type { Capabilities, ToolError } from '../types';
import { ProjectSession, SessionState } from '../session';
import { EditorPort, TriggerChannel } from '../ports/editor';
import { ok, fail, UsecaseResult } from './result';
import { resolveAnimationTarget } from '../services/lookup';
import { createId } from '../services/id';

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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation name is required' });
    }
    if (!Number.isFinite(payload.length) || payload.length <= 0) {
      return fail({ code: 'invalid_payload', message: 'Animation length must be > 0' });
    }
    if (!Number.isFinite(payload.fps) || payload.fps <= 0) {
      return fail({ code: 'invalid_payload', message: 'Animation fps must be > 0' });
    }
    if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
      return fail({
        code: 'invalid_payload',
        message: `Animation length exceeds max ${this.capabilities.limits.maxAnimationSeconds} seconds`
      });
    }
    const snapshot = this.getSnapshot();
    const nameConflict = snapshot.animations.some((a) => a.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: `Animation clip already exists: ${payload.name}` });
    }
    const id = payload.id ?? createId('anim');
    const idConflict = snapshot.animations.some((a) => a.id && a.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: `Animation id already exists: ${id}` });
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    const snapshot = this.getSnapshot();
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation clip id or name is required' });
    }
    const target = resolveAnimationTarget(snapshot.animations, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('anim');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.animations.some((a) => a.name === payload.newName && a.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: `Animation clip already exists: ${payload.newName}` });
      }
    }
    if (payload.length !== undefined) {
      if (!Number.isFinite(payload.length) || payload.length <= 0) {
        return fail({ code: 'invalid_payload', message: 'Animation length must be > 0' });
      }
      if (payload.length > this.capabilities.limits.maxAnimationSeconds) {
        return fail({
          code: 'invalid_payload',
          message: `Animation length exceeds max ${this.capabilities.limits.maxAnimationSeconds} seconds`
        });
      }
    }
    if (payload.fps !== undefined && (!Number.isFinite(payload.fps) || payload.fps <= 0)) {
      return fail({ code: 'invalid_payload', message: 'Animation fps must be > 0' });
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.animations) {
      return fail({ code: 'unsupported_format', message: 'Animations are not supported for this format' });
    }
    const snapshot = this.getSnapshot();
    if (!payload.id && !payload.name) {
      return fail({ code: 'invalid_payload', message: 'Animation clip id or name is required' });
    }
    const target = resolveAnimationTarget(snapshot.animations, payload.id, payload.name);
    if (!target) {
      const label = payload.id ?? payload.name ?? 'unknown';
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot();
    const anim = resolveAnimationTarget(snapshot.animations, payload.clipId, payload.clip);
    if (!anim) {
      const label = payload.clipId ?? payload.clip;
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
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
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const revisionErr = this.ensureRevisionMatch(payload.ifRevision);
    if (revisionErr) return fail(revisionErr);
    const snapshot = this.getSnapshot();
    const anim = resolveAnimationTarget(snapshot.animations, payload.clipId, payload.clip);
    if (!anim) {
      const label = payload.clipId ?? payload.clip;
      return fail({ code: 'invalid_payload', message: `Animation clip not found: ${label}` });
    }
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
}
