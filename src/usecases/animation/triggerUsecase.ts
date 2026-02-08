import type { ProjectSession, SessionState } from '../../session';
import type { EditorPort, TriggerChannel } from '../../ports/editor';
import type { ToolError } from '@ashfox/contracts/types/internal';
import { fail, ok, type UsecaseResult } from '../result';
import { isValidTriggerPayloadValue } from './triggerPayload';
import { ensureClipSelector, resolveClipTarget } from './clipSelectors';
import {
  ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED,
  TRIGGER_TIME_INVALID,
  TRIGGER_VALUE_INVALID
} from '../../shared/messages';

export type SetTriggerKeyframesPayload = {
  clipId?: string;
  clip: string;
  channel: TriggerChannel;
  keys: { time: number; value: string | string[] | Record<string, unknown> }[];
};

export interface TriggerUsecaseDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureAnimationsSupported: () => ToolError | null;
}

export const runSetTriggerKeyframes = (
  deps: TriggerUsecaseDeps,
  payload: SetTriggerKeyframesPayload
): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> => {
  const supportErr = deps.ensureAnimationsSupported();
  if (supportErr) return fail(supportErr);
  const snapshot = deps.getSnapshot();
  const selectorErr = ensureClipSelector(payload.clipId, payload.clip);
  if (selectorErr) return fail(selectorErr);
  const resolved = resolveClipTarget(snapshot, payload.clipId, payload.clip);
  if (!resolved.ok) return resolved;
  const anim = resolved.value;
  if (payload.keys.length !== 1) {
    return fail({ code: 'invalid_payload', message: ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED });
  }
  const key = payload.keys[0];
  if (!Number.isFinite(key.time)) {
    return fail({ code: 'invalid_payload', message: TRIGGER_TIME_INVALID('set_trigger_keyframes') });
  }
  if (!isValidTriggerPayloadValue(key.value)) {
    return fail({ code: 'invalid_payload', message: TRIGGER_VALUE_INVALID('set_trigger_keyframes') });
  }
  const err = deps.editor.setTriggerKeyframes({
    clipId: anim.id,
    clip: anim.name,
    channel: payload.channel,
    keys: payload.keys,
    timePolicy: snapshot.animationTimePolicy
  });
  if (err) return fail(err);
  deps.session.upsertAnimationTrigger(anim.name, {
    type: payload.channel,
    keys: payload.keys
  });
  return ok({ clip: anim.name, clipId: anim.id ?? undefined, channel: payload.channel });
};
