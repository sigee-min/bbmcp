import { ApplyEntitySpecPayload } from '../spec';
import { guardUvForTextureTargets } from './uvGuard';
import { collectTextureTargets } from '../domain/uvTargets';
import type { TextureUsage } from '../domain/model';
import { applyModelSpecSteps, applyTextureSpecSteps, createApplyReport } from './apply';
import { withErrorMeta } from './meta';
import { createProxyPipeline } from './pipeline';
import { validateEntitySpec } from './validators';
import { ProxyPipelineDeps, tryRecoverUvForTextureSpec } from './texturePipeline';
import { ToolResponse } from '../types';
import { err } from '../services/toolResponse';

export const applyEntitySpecProxy = async (
  deps: ProxyPipelineDeps,
  payload: ApplyEntitySpecPayload
): Promise<ToolResponse<unknown>> => {
  const v = validateEntitySpec(payload, deps.limits);
  if (!v.ok) return v;
  if (payload.format !== 'geckolib') {
    return err('not_implemented', `Format not implemented: ${payload.format}`);
  }
  const pipeline = createProxyPipeline({
    service: deps.service,
    payload,
    includeStateByDefault: deps.includeStateByDefault,
    includeDiffByDefault: deps.includeDiffByDefault,
    runWithoutRevisionGuard: (fn) => deps.runWithoutRevisionGuard(fn)
  });
  const guard = pipeline.guardRevision();
  if (guard) return guard;
  return pipeline.run(async () => {
    const result: Record<string, unknown> = {
      format: payload.format,
      targetVersion: payload.targetVersion ?? 'v4'
    };
    if (payload.ensureProject) {
      const options = typeof payload.ensureProject === 'object' ? payload.ensureProject : {};
      const ensure = deps.service.ensureProject({
        format: 'geckolib',
        name: options.name,
        match: options.match ?? 'format',
        onMismatch: options.onMismatch ?? 'reuse',
        onMissing: options.onMissing ?? 'create',
        confirmDiscard: options.confirmDiscard,
        confirmDialog: options.confirmDialog,
        dialog: options.dialog,
        ifRevision: payload.ifRevision
      });
      if (!ensure.ok) return withErrorMeta(ensure.error, pipeline.meta, deps.service);
      result.project = ensure.value;
    }
    const stateCheck = deps.service.getProjectState({ detail: 'summary' });
    if (!stateCheck.ok) return withErrorMeta(stateCheck.error, pipeline.meta, deps.service);
    if (stateCheck.value.project.format !== 'geckolib') {
      return withErrorMeta(
        {
          code: 'invalid_state',
          message: 'Active project format must be geckolib for apply_entity_spec.',
          fix: 'Call apply_entity_spec with ensureProject or switch to a geckolib project.'
        },
        pipeline.meta,
        deps.service
      );
    }
    if (payload.model) {
      const report = createApplyReport();
      const modelRes = applyModelSpecSteps(
        deps.service,
        deps.log,
        { model: payload.model, ifRevision: payload.ifRevision },
        report,
        pipeline.meta
      );
      if (!modelRes.ok) return modelRes;
      result.model = { applied: true, report };
    }
    if (payload.textures && payload.textures.length > 0) {
      const targets = collectTextureTargets(payload.textures);
      let uvGuard = guardUvForTextureTargets(deps.service, pipeline.meta, payload.uvUsageId, targets);
      let usage: TextureUsage | null = null;
      let recovery: Record<string, unknown> | undefined;
      let recoveredUvUsageId: string | undefined;
      if (!uvGuard.ok) {
        const recovered = tryRecoverUvForTextureSpec(deps, payload, pipeline.meta, targets, uvGuard.error);
        if (!recovered) return uvGuard;
        if (!recovered.ok) return recovered;
        usage = recovered.data.usage;
        recovery = recovered.data.recovery;
        recoveredUvUsageId = recovered.data.uvUsageId;
      } else {
        usage = uvGuard.data.usage;
      }
      const report = createApplyReport();
      const textureRes = await applyTextureSpecSteps(
        deps.service,
        deps.dom,
        deps.limits,
        payload.textures,
        report,
        pipeline.meta,
        deps.log,
        usage ?? undefined
      );
      if (!textureRes.ok) return textureRes;
      result.textures = {
        applied: true,
        report,
        ...(recovery
          ? {
              recovery,
              uvUsageId: recoveredUvUsageId
            }
          : {})
      };
    }
    if (payload.animations && payload.animations.length > 0) {
      const stateRes = deps.service.getProjectState({ detail: 'full' });
      if (!stateRes.ok) return withErrorMeta(stateRes.error, pipeline.meta, deps.service);
      const existing = new Set((stateRes.value.project.animations ?? []).map((anim) => anim.name));
      const applied: string[] = [];
      let keyframeCount = 0;
      for (const anim of payload.animations) {
        const mode = anim.mode ?? (existing.has(anim.name) ? 'update' : 'create');
        if (mode === 'create') {
          const createRes = deps.service.createAnimationClip({
            name: anim.name,
            length: anim.length,
            loop: anim.loop,
            fps: anim.fps ?? 20,
            ifRevision: payload.ifRevision
          });
          if (!createRes.ok) return withErrorMeta(createRes.error, pipeline.meta, deps.service);
        } else {
          const updateRes = deps.service.updateAnimationClip({
            name: anim.name,
            length: anim.length,
            loop: anim.loop,
            fps: anim.fps,
            ifRevision: payload.ifRevision
          });
          if (!updateRes.ok) return withErrorMeta(updateRes.error, pipeline.meta, deps.service);
        }
        applied.push(anim.name);
        if (anim.channels) {
          for (const channel of anim.channels) {
            keyframeCount += channel.keys.length;
            const keyRes = deps.service.setKeyframes({
              clip: anim.name,
              bone: channel.bone,
              channel: channel.channel,
              keys: channel.keys,
              ifRevision: payload.ifRevision
            });
            if (!keyRes.ok) return withErrorMeta(keyRes.error, pipeline.meta, deps.service);
          }
        }
        if (anim.triggers) {
          for (const trigger of anim.triggers) {
            keyframeCount += trigger.keys.length;
            const triggerRes = deps.service.setTriggerKeyframes({
              clip: anim.name,
              channel: trigger.type,
              keys: trigger.keys,
              ifRevision: payload.ifRevision
            });
            if (!triggerRes.ok) return withErrorMeta(triggerRes.error, pipeline.meta, deps.service);
          }
        }
      }
      result.animations = { applied: true, clips: applied, keyframes: keyframeCount };
    }
    return pipeline.ok(result);
  });
};
