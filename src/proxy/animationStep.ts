import type { EntityAnimationSpec } from '../spec';
import type { ProjectState, ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type { MetaOptions } from './meta';
import { loadProjectState } from './projectState';
import { isResponseError, isUsecaseError, usecaseError } from './guardHelpers';

export type AnimationApplyResult = {
  clips: string[];
  keyframes: number;
};

export const applyEntityAnimations = (
  service: ToolService,
  meta: MetaOptions,
  animations: EntityAnimationSpec[],
  ifRevision?: string,
  project?: ProjectState
): ToolResponse<AnimationApplyResult> => {
  let projectState: ProjectState;
  if (project) {
    projectState = project;
  } else {
    const stateRes = loadProjectState(service, meta, 'full', { includeUsage: false });
    if (isResponseError(stateRes)) return stateRes;
    projectState = stateRes.data;
  }
  const existing = new Set((projectState.animations ?? []).map((anim) => anim.name));
  const applied: string[] = [];
  let keyframeCount = 0;
  for (const anim of animations) {
    const mode = anim.mode ?? (existing.has(anim.name) ? 'update' : 'create');
    if (mode === 'create') {
      const createRes = service.createAnimationClip({
        name: anim.name,
        length: anim.length,
        loop: anim.loop,
        fps: anim.fps ?? 20,
        ifRevision
      });
      if (isUsecaseError(createRes)) return usecaseError(createRes, meta, service);
    } else {
      const updateRes = service.updateAnimationClip({
        name: anim.name,
        length: anim.length,
        loop: anim.loop,
        fps: anim.fps,
        ifRevision
      });
      if (isUsecaseError(updateRes)) return usecaseError(updateRes, meta, service);
    }
    applied.push(anim.name);
    if (anim.channels) {
      for (const channel of anim.channels) {
        keyframeCount += channel.keys.length;
        const keyRes = service.setKeyframes({
          clip: anim.name,
          bone: channel.bone,
          channel: channel.channel,
          keys: channel.keys,
          ifRevision
        });
        if (isUsecaseError(keyRes)) return usecaseError(keyRes, meta, service);
      }
    }
    if (anim.triggers) {
      for (const trigger of anim.triggers) {
        keyframeCount += trigger.keys.length;
        const triggerRes = service.setTriggerKeyframes({
          clip: anim.name,
          channel: trigger.type,
          keys: trigger.keys,
          ifRevision
        });
        if (isUsecaseError(triggerRes)) return usecaseError(triggerRes, meta, service);
      }
    }
  }
  return { ok: true, data: { clips: applied, keyframes: keyframeCount } };
};
