import type { Cube, TextureUsage } from '../model';
import { computeTextureUsageId } from '../textureUsage';
import { computeUvOverlapIssues, computeUvScaleIssues, formatOverlapExample, formatScaleExample } from './issues';
import { expandTextureTargets, isIssueTarget, type TextureTargetSet } from './targets';
import type { UvPolicyConfig } from './policy';

export type UvGuardMessages = {
  usageChangedMessage: string;
  usageChangedFix: string;
  overlapMessage: (names: string, suffix: string, example: string, plural: boolean) => string;
  overlapFix: string;
  scaleMessage: (names: string, suffix: string, example: string, plural: boolean) => string;
  scaleFix: string;
};

export type UvGuardError = {
  code: 'invalid_state';
  message: string;
  fix?: string;
  details?: Record<string, unknown>;
};

export const guardUvUsageId = (
  usage: TextureUsage,
  expectedUsageId: string,
  projectResolution: { width: number; height: number } | undefined,
  messages: UvGuardMessages
): UvGuardError | null => {
  const currentUsageId = computeTextureUsageId(usage, projectResolution);
  if (currentUsageId === expectedUsageId) return null;
  return {
    code: 'invalid_state',
    message: messages.usageChangedMessage,
    fix: messages.usageChangedFix,
    details: { reason: 'uv_usage_mismatch', expected: expectedUsageId, current: currentUsageId }
  };
};

export const guardUvOverlaps = (
  usage: TextureUsage,
  targets: TextureTargetSet,
  messages: UvGuardMessages
): UvGuardError | null => {
  const expanded = expandTextureTargets(usage, targets);
  const blocking = computeUvOverlapIssues(usage).filter((issue) => isIssueTarget(issue, expanded));
  if (blocking.length === 0) return null;
  const sample = blocking[0];
  const example = formatOverlapExample(sample.example);
  const names = blocking
    .slice(0, 3)
    .map((issue) => `"${issue.textureName}"`)
    .join(', ');
  const suffix = blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
  return {
    code: 'invalid_state',
    message: messages.overlapMessage(names, suffix, example, blocking.length !== 1),
    fix: messages.overlapFix,
    details: {
      reason: 'uv_overlap',
      overlaps: blocking.map((issue) => ({
        textureId: issue.textureId ?? undefined,
        textureName: issue.textureName,
        conflictCount: issue.conflictCount,
        example: issue.example
      }))
    }
  };
};

export const guardUvScale = (args: {
  usage: TextureUsage;
  cubes: Cube[];
  resolution?: { width: number; height: number };
  policy: UvPolicyConfig;
  targets: TextureTargetSet;
  messages: UvGuardMessages;
}): UvGuardError | null => {
  if (!args.resolution) return null;
  const expanded = expandTextureTargets(args.usage, args.targets);
  const scaleResult = computeUvScaleIssues(args.usage, args.cubes, args.resolution, args.policy);
  const blocking = scaleResult.issues.filter((issue) => isIssueTarget(issue, expanded));
  if (blocking.length === 0) return null;
  const sample = blocking[0];
  const example = sample.example ? ` Example: ${formatScaleExample(sample.example)}.` : '';
  const names = blocking
    .slice(0, 3)
    .map((issue) => `"${issue.textureName}"`)
    .join(', ');
  const suffix = blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
  return {
    code: 'invalid_state',
    message: args.messages.scaleMessage(names, suffix, example, blocking.length !== 1),
    fix: args.messages.scaleFix,
    details: {
      reason: 'uv_scale_mismatch',
      mismatches: blocking.map((issue) => ({
        textureId: issue.textureId ?? undefined,
        textureName: issue.textureName,
        mismatchCount: issue.mismatchCount,
        example: issue.example
      }))
    }
  };
};

export const guardUvUsage = (args: {
  usage: TextureUsage;
  cubes: Cube[];
  expectedUsageId?: string;
  resolution?: { width: number; height: number };
  policy: UvPolicyConfig;
  targets: TextureTargetSet;
  messages: UvGuardMessages;
}): UvGuardError | null => {
  if (args.expectedUsageId) {
    const usageErr = guardUvUsageId(args.usage, args.expectedUsageId, args.resolution, args.messages);
    if (usageErr) return usageErr;
  }
  const overlapErr = guardUvOverlaps(args.usage, args.targets, args.messages);
  if (overlapErr) return overlapErr;
  return guardUvScale({
    usage: args.usage,
    cubes: args.cubes,
    resolution: args.resolution,
    policy: args.policy,
    targets: args.targets,
    messages: args.messages
  });
};





