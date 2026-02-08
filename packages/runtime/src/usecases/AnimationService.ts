import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import { ProjectSession, SessionState } from '../session';
import { EditorPort, TriggerChannel } from '../ports/editor';
import { UsecaseResult } from './result';
import { withActiveAndRevision } from './guards';
import { ANIMATION_UNSUPPORTED_FORMAT } from '../shared/messages';
import {
  runCreateAnimationClip,
  runDeleteAnimationClip,
  runUpdateAnimationClip,
  type AnimationClipCrudDeps
} from './animation/clipCrudUsecases';
import { runSetFramePose, type PoseUsecaseDeps, type SetFramePosePayload } from './animation/poseUsecase';
import {
  runSetTriggerKeyframes,
  type SetTriggerKeyframesPayload,
  type TriggerUsecaseDeps
} from './animation/triggerUsecase';

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
      () => runCreateAnimationClip(this.getClipCrudDeps(), payload)
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
      () => runUpdateAnimationClip(this.getClipCrudDeps(), payload)
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
      () => runDeleteAnimationClip(this.getClipCrudDeps(), payload)
    );
  }

  setFramePose(payload: SetFramePosePayload & { ifRevision?: string }): UsecaseResult<{
    clip: string;
    clipId?: string;
    frame: number;
    time: number;
    bones: number;
    channels: number;
  }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => runSetFramePose(this.getPoseDeps(), payload)
    );
  }

  setTriggerKeyframes(
    payload: SetTriggerKeyframesPayload & { ifRevision?: string }
  ): UsecaseResult<{ clip: string; clipId?: string; channel: TriggerChannel }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => runSetTriggerKeyframes(this.getTriggerDeps(), payload)
    );
  }

  private ensureAnimationsSupported(): ToolError | null {
    const format = this.session.snapshot().format;
    const capability = this.capabilities.formats.find((entry) => entry.format === format);
    if (!capability || !capability.animations) {
      return { code: 'unsupported_format', message: ANIMATION_UNSUPPORTED_FORMAT };
    }
    return null;
  }

  private getClipCrudDeps(): AnimationClipCrudDeps {
    return {
      session: this.session,
      editor: this.editor,
      capabilities: this.capabilities,
      getSnapshot: this.getSnapshot,
      ensureAnimationsSupported: () => this.ensureAnimationsSupported()
    };
  }

  private getPoseDeps(): PoseUsecaseDeps {
    return {
      session: this.session,
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureAnimationsSupported: () => this.ensureAnimationsSupported()
    };
  }

  private getTriggerDeps(): TriggerUsecaseDeps {
    return {
      session: this.session,
      editor: this.editor,
      getSnapshot: this.getSnapshot,
      ensureAnimationsSupported: () => this.ensureAnimationsSupported()
    };
  }
}
