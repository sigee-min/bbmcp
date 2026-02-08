import assert from 'node:assert/strict';

import type { Capabilities, ToolError } from '../src/types/internal';
import { ProjectSession } from '../src/session';
import {
  ANIMATION_UNSUPPORTED_FORMAT,
  ANIMATION_CLIP_NAME_REQUIRED,
  ANIMATION_FRAME_INVALID,
  ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED,
  TRIGGER_TIME_INVALID,
  TRIGGER_VALUE_INVALID
} from '../src/shared/messages';
import {
  runCreateAnimationClip,
  runDeleteAnimationClip,
  runUpdateAnimationClip,
  type AnimationClipCrudDeps
} from '../src/usecases/animation/clipCrudUsecases';
import { ensureClipSelector, resolveClipTarget } from '../src/usecases/animation/clipSelectors';
import { runSetFramePose } from '../src/usecases/animation/poseUsecase';
import { runSetTriggerKeyframes } from '../src/usecases/animation/triggerUsecase';
import { createEditorStub } from './fakes';

const normalizedMessage = (message: string): string => (message.endsWith('.') ? message : `${message}.`);

const capabilities: Capabilities = {
  pluginVersion: 'test',
  blockbenchVersion: '5.0.7',
  formats: [{ format: 'geckolib', animations: true, enabled: true }],
  limits: { maxCubes: 64, maxTextureSize: 256, maxAnimationSeconds: 30 }
};

const createSession = (): ProjectSession => {
  const session = new ProjectSession();
  const createRes = session.create('geckolib', 'test', 'geckolib');
  assert.equal(createRes.ok, true);
  session.addBone({ name: 'body', pivot: [0, 0, 0] });
  session.addAnimation({ id: 'anim_idle', name: 'idle', length: 1, loop: true, fps: 20, channels: [] });
  session.addAnimation({ id: 'anim_walk', name: 'walk', length: 1, loop: true, fps: 20, channels: [] });
  return session;
};

const createCrudDeps = (
  session: ProjectSession,
  options?: { supportError?: ToolError | null; editor?: ReturnType<typeof createEditorStub> }
): AnimationClipCrudDeps => {
  const editor = options?.editor ?? createEditorStub();
  return {
    session,
    editor,
    capabilities,
    getSnapshot: () => session.snapshot(),
    ensureAnimationsSupported: () => options?.supportError ?? null
  };
};

{
  const err = ensureClipSelector(' ', 'idle');
  assert.equal(err?.code, 'invalid_payload');
}

{
  const err = ensureClipSelector(undefined, ' ');
  assert.equal(err?.code, 'invalid_payload');
}

{
  const session = createSession();
  const resolved = resolveClipTarget(session.snapshot(), undefined, 'missing');
  assert.equal(resolved.ok, false);
}

{
  const session = createSession();
  const res = runCreateAnimationClip(
    createCrudDeps(session, { supportError: { code: 'unsupported_format', message: 'unsupported' } }),
    { name: 'new', length: 1, loop: true, fps: 20 }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'unsupported_format');
}

{
  const session = createSession();
  const res = runCreateAnimationClip(createCrudDeps(session), { name: '', length: 1, loop: true, fps: 20 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage(ANIMATION_CLIP_NAME_REQUIRED));
}

{
  const session = createSession();
  const res = runCreateAnimationClip(createCrudDeps(session), { name: 'idle', length: 1, loop: true, fps: 20 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'invalid_payload');
}

{
  const session = createSession();
  const res = runCreateAnimationClip(createCrudDeps(session), {
    id: 'anim_new',
    name: 'new',
    length: 2,
    loop: false,
    fps: 12
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.id, 'anim_new');
    assert.equal(res.value.name, 'new');
  }
}

{
  const session = createSession();
  const res = runUpdateAnimationClip(createCrudDeps(session), { id: ' ', newName: 'next' });
  assert.equal(res.ok, false);
}

{
  const session = createSession();
  const res = runUpdateAnimationClip(createCrudDeps(session), { id: 'missing', newName: 'next' });
  assert.equal(res.ok, false);
}

{
  const session = createSession();
  const res = runUpdateAnimationClip(createCrudDeps(session), { id: 'anim_idle', newName: 'walk' });
  assert.equal(res.ok, false);
}

{
  const session = createSession();
  const editor = createEditorStub();
  editor.updateAnimation = () => ({ code: 'unknown', message: 'update failed' });
  const res = runUpdateAnimationClip(createCrudDeps(session, { editor }), {
    id: 'anim_idle',
    newName: 'idle_next'
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('update failed'));
}

{
  const session = createSession();
  const res = runUpdateAnimationClip(createCrudDeps(session), {
    id: 'anim_idle',
    newName: 'idle_next',
    length: 3,
    loop: false,
    fps: 30
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.id, 'anim_idle');
    assert.equal(res.value.name, 'idle_next');
  }
}

{
  const session = createSession();
  const res = runDeleteAnimationClip(
    createCrudDeps(session, { supportError: { code: 'unsupported_format', message: 'unsupported' } }),
    { name: 'idle' }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'unsupported_format');
}

{
  const session = createSession();
  const res = runDeleteAnimationClip(createCrudDeps(session), {});
  assert.equal(res.ok, false);
}

{
  const session = createSession();
  const editor = createEditorStub();
  editor.deleteAnimation = () => ({ code: 'unknown', message: 'delete failed' });
  const res = runDeleteAnimationClip(createCrudDeps(session, { editor }), { name: 'idle' });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('delete failed'));
}

{
  const session = createSession();
  const res = runDeleteAnimationClip(createCrudDeps(session), { names: ['idle', 'walk'] });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.deleted.length, 2);
}

{
  const session = createSession();
  const res = runSetFramePose(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => ({ code: 'unsupported_format', message: 'unsupported' })
    },
    {
      clip: 'idle',
      frame: 0,
      bones: [{ name: 'body', rot: [1, 0, 0] }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, 'unsupported_format');
}

{
  const session = createSession();
  const res = runSetFramePose(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      frame: -1,
      bones: [{ name: 'body', rot: [1, 0, 0] }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage(ANIMATION_FRAME_INVALID));
}

{
  const session = createSession();
  const editor = createEditorStub();
  editor.setKeyframes = () => ({ code: 'unknown', message: 'keyframe failed' });
  const res = runSetFramePose(
    {
      session,
      editor,
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      frame: 1,
      bones: [{ name: 'body', rot: [1, 0, 0] }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('keyframe failed'));
}

{
  const session = createSession();
  const calls: Array<{ channel: string; time: number }> = [];
  const editor = createEditorStub();
  editor.setKeyframes = (params) => {
    calls.push({ channel: params.channel, time: params.keys[0].time });
    return null;
  };
  const res = runSetFramePose(
    {
      session,
      editor,
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      frame: 10,
      bones: [{ name: 'body', rot: [1, 2, 3], pos: [4, 5, 6] }]
    }
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.channels, 2);
    assert.equal(res.value.time, 0.5);
  }
  assert.equal(calls.length, 2);
}

{
  const session = createSession();
  const res = runSetTriggerKeyframes(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => ({ code: 'unsupported_format', message: ANIMATION_UNSUPPORTED_FORMAT })
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [{ time: 0, value: 'a' }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'unsupported_format');
    assert.equal(res.error.message, normalizedMessage(ANIMATION_UNSUPPORTED_FORMAT));
  }
}

{
  const session = createSession();
  const res = runSetTriggerKeyframes(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [
        { time: 0, value: 'a' },
        { time: 1, value: 'b' }
      ]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage(ANIMATION_TRIGGER_KEYFRAME_SINGLE_REQUIRED));
}

{
  const session = createSession();
  const res = runSetTriggerKeyframes(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [{ time: Number.NaN, value: 'a' }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage(TRIGGER_TIME_INVALID('set_trigger_keyframes')));
}

{
  const session = createSession();
  const res = runSetTriggerKeyframes(
    {
      session,
      editor: createEditorStub(),
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [{ time: 0, value: 123 as unknown as string }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage(TRIGGER_VALUE_INVALID('set_trigger_keyframes')));
}

{
  const session = createSession();
  const editor = createEditorStub();
  editor.setTriggerKeyframes = () => ({ code: 'unknown', message: 'trigger failed' });
  const res = runSetTriggerKeyframes(
    {
      session,
      editor,
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [{ time: 0, value: 'play' }]
    }
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.message, normalizedMessage('trigger failed'));
}

{
  const session = createSession();
  const editor = createEditorStub();
  const calls: string[] = [];
  editor.setTriggerKeyframes = (params) => {
    calls.push(params.channel);
    return null;
  };
  const res = runSetTriggerKeyframes(
    {
      session,
      editor,
      getSnapshot: () => session.snapshot(),
      ensureAnimationsSupported: () => null
    },
    {
      clip: 'idle',
      channel: 'sound',
      keys: [{ time: 0, value: 'play' }]
    }
  );
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.value.clip, 'idle');
  assert.deepEqual(calls, ['sound']);
}
