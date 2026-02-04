import type { Capabilities, ToolError } from '../types';
import { ProjectSession, SessionState } from '../session';
import { EditorPort, TriggerChannel } from '../ports/editor';
import { ok, fail, UsecaseResult } from './result';
import { resolveAnimationTarget } from './targetResolvers';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from './crudChecks';
import { ensureNonBlankString } from '../shared/payloadValidation';
import { withActiveAndRevision } from './guards';
import { resolveTargets } from './targetSelectors';
import { buildIdNameMismatchMessage } from '../shared/targetMessages';
import {
  ANIMATION_CLIP_EXISTS,
  ANIMATION_CLIP_ID_OR_NAME_REQUIRED,
  ANIMATION_CLIP_NAME_REQUIRED,
  ANIMATION_CLIP_NOT_FOUND,
  ANIMATION_FPS_POSITIVE,
  ANIMATION_ID_EXISTS,
  ANIMATION_KEYFRAME_SINGLE_REQUIRED,
  ANIMATION_LENGTH_EXCEEDS_MAX,
  ANIMATION_LENGTH_POSITIVE,
  ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED,
  ANIMATION_UNSUPPORTED_FORMAT,
  KEYFRAME_TIME_INVALID,
  KEYFRAME_VALUE_INVALID,
  MODEL_BONE_NOT_FOUND,
  TRIGGER_TIME_INVALID,
  TRIGGER_VALUE_INVALID
} from '../shared/messages';
import { isRecord } from '../domain/guards';

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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
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
        const nameErr = ensureNameAvailable(snapshot.animations, payload.name, ANIMATION_CLIP_EXISTS);
        if (nameErr) return fail(nameErr);
        const id = resolveEntityId(undefined, payload.id, 'anim');
        const idErr = ensureIdAvailable(snapshot.animations, id, ANIMATION_ID_EXISTS);
        if (idErr) return fail(idErr);
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
    );
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const supportErr = this.ensureAnimationsSupported();
        if (supportErr) return fail(supportErr);
        const snapshot = this.getSnapshot();
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
    );
  }

  deleteAnimationClip(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const supportErr = this.ensureAnimationsSupported();
        if (supportErr) return fail(supportErr);
        const snapshot = this.getSnapshot();
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
          const err = this.editor.deleteAnimation({ id: target.id ?? undefined, name: target.name });
          if (err) return fail(err);
        }
        const nameSet = new Set(targets.map((target) => target.name));
        this.session.removeAnimations(nameSet);
        const deleted = targets.map((target) => ({ id: target.id ?? undefined, name: target.name }));
        const primary = deleted[0] ?? { id: targets[0]?.id ?? undefined, name: targets[0]?.name ?? 'unknown' };
        return ok({ id: primary.id ?? primary.name, name: primary.name, deleted });
      }
    );
  }

  setKeyframes(payload: {
    clipId?: string;
    clip: string;
    bone: string;
    channel: 'rot' | 'pos' | 'scale';
    keys: { time: number; value: [number, number, number]; interp?: 'linear' | 'step' | 'catmullrom' }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; bone: string }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const selectorErr = this.ensureClipSelector(payload.clipId, payload.clip);
        if (selectorErr) return fail(selectorErr);
        const boneBlankErr = ensureNonBlankString(payload.bone, 'Animation bone');
        if (boneBlankErr) return fail(boneBlankErr);
        const boneExists = snapshot.bones.some((bone) => bone.name === payload.bone);
        if (!boneExists) return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(payload.bone) });
        const resolved = this.resolveClipTarget(snapshot, payload.clipId, payload.clip);
        if (!resolved.ok) return resolved;
        const anim = resolved.value;
        if (payload.keys.length !== 1) {
          return fail({ code: 'invalid_payload', message: ANIMATION_KEYFRAME_SINGLE_REQUIRED });
        }
        const key = payload.keys[0];
        if (!Number.isFinite(key.time)) {
          return fail({ code: 'invalid_payload', message: KEYFRAME_TIME_INVALID('set_keyframes') });
        }
        if (!Array.isArray(key.value) || key.value.length < 3 || key.value.some((v) => !Number.isFinite(v))) {
          return fail({ code: 'invalid_payload', message: KEYFRAME_VALUE_INVALID('set_keyframes') });
        }
        const err = this.editor.setKeyframes({
          clipId: anim.id,
          clip: anim.name,
          bone: payload.bone,
          channel: payload.channel,
          keys: payload.keys,
          timePolicy: snapshot.animationTimePolicy
        });
        if (err) return fail(err);
        this.session.upsertAnimationChannel(anim.name, {
          bone: payload.bone,
          channel: payload.channel,
          keys: payload.keys
        });
        return ok({ clip: anim.name, clipId: anim.id ?? undefined, bone: payload.bone });
      }
    );
  }

  setTriggerKeyframes(payload: {
    clipId?: string;
    clip: string;
    channel: TriggerChannel;
    keys: { time: number; value: string | string[] | Record<string, unknown> }[];
    ifRevision?: string;
  }): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const selectorErr = this.ensureClipSelector(payload.clipId, payload.clip);
        if (selectorErr) return fail(selectorErr);
        const resolved = this.resolveClipTarget(snapshot, payload.clipId, payload.clip);
        if (!resolved.ok) return resolved;
        const anim = resolved.value;
        if (payload.keys.length !== 1) {
          return fail({ code: 'invalid_payload', message: ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED });
        }
        const key = payload.keys[0];
        if (!Number.isFinite(key.time)) {
          return fail({ code: 'invalid_payload', message: TRIGGER_TIME_INVALID('set_trigger_keyframes') });
        }
        const value = key.value;
        const validValue =
          typeof value === 'string' ||
          (Array.isArray(value) && value.every((item) => typeof item === 'string')) ||
          (isRecord(value) && this.isJsonSafe(value));
        if (!validValue) {
          return fail({ code: 'invalid_payload', message: TRIGGER_VALUE_INVALID('set_trigger_keyframes') });
        }
        const err = this.editor.setTriggerKeyframes({
          clipId: anim.id,
          clip: anim.name,
          channel: payload.channel,
          keys: payload.keys,
          timePolicy: snapshot.animationTimePolicy
        });
        if (err) return fail(err);
        this.session.upsertAnimationTrigger(anim.name, {
          type: payload.channel,
          keys: payload.keys
        });
        return ok({ clip: anim.name, clipId: anim.id ?? undefined, channel: payload.channel });
      }
    );
  }

  private resolveClipTarget(
    snapshot: SessionState,
    clipId: string | undefined,
    clip: string | undefined
  ): UsecaseResult<SessionState['animations'][number]> {
    const resolved = resolveAnimationTarget(snapshot.animations, clipId, clip);
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

  private isJsonSafe(value: unknown, seen: Set<object> = new Set()): boolean {
    if (value === null) return true;
    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') return Number.isFinite(value as number) || valueType !== 'number';
    if (valueType !== 'object') return false;
    if (seen.has(value as object)) return false;
    seen.add(value as object);
    if (Array.isArray(value)) {
      return value.every((entry) => this.isJsonSafe(entry, seen));
    }
    const record = value as Record<string, unknown>;
    return Object.keys(record).every((key) => this.isJsonSafe(record[key], seen));
  }
}





