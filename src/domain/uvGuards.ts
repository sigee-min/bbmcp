import type { Cube, TextureUsage } from './model';
import { computeTextureUsageId } from './textureUsage';
import { findUvOverlapIssues, formatUvFaceRect } from './uvOverlap';
import { findUvScaleIssues } from './uvScale';
import { expandTextureTargets, isIssueTarget, type TextureTargetSet } from './uvTargets';
import type { UvPolicyConfig } from './uvPolicy';
import {
  UV_OVERLAP_FIX,
  UV_OVERLAP_MESSAGE,
  UV_SCALE_FIX,
  UV_SCALE_MESSAGE,
  UV_USAGE_CHANGED_FIX,
  UV_USAGE_CHANGED_MESSAGE
} from '../shared/messages';

export type UvGuardError = {
  code: 'invalid_state';
  message: string;
  fix?: string;
  details?: Record<string, unknown>;
};

export const guardUvUsageId = (usage: TextureUsage, expectedUsageId: string): UvGuardError | null => {
  const currentUsageId = computeTextureUsageId(usage);
  if (currentUsageId === expectedUsageId) return null;
  return {
    code: 'invalid_state',
    message: UV_USAGE_CHANGED_MESSAGE,
    fix: UV_USAGE_CHANGED_FIX,
    details: { reason: 'uv_usage_mismatch', expected: expectedUsageId, current: currentUsageId }
  };
};

export const guardUvOverlaps = (usage: TextureUsage, targets: TextureTargetSet): UvGuardError | null => {
  const expanded = expandTextureTargets(usage, targets);
  const blocking = findUvOverlapIssues(usage).filter((issue) => isIssueTarget(issue, expanded));
  if (blocking.length === 0) return null;
  const sample = blocking[0];
  const example = sample.example
    ? ` Example: ${formatUvFaceRect(sample.example.a)} overlaps ${formatUvFaceRect(sample.example.b)}.`
    : '';
  const names = blocking
    .slice(0, 3)
    .map((issue) => `"${issue.textureName}"`)
    .join(', ');
  const suffix = blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
  return {
    code: 'invalid_state',
    message: UV_OVERLAP_MESSAGE(names, suffix, example, blocking.length !== 1),
    fix: UV_OVERLAP_FIX,
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
}): UvGuardError | null => {
  const expanded = expandTextureTargets(args.usage, args.targets);
  const scaleResult = findUvScaleIssues(args.usage, args.cubes, args.resolution, args.policy);
  const blocking = scaleResult.issues.filter((issue) => isIssueTarget(issue, expanded));
  if (blocking.length === 0) return null;
  const sample = blocking[0];
  const example = sample.example
    ? ` Example: ${sample.example.cubeName} (${sample.example.face}) actual ${sample.example.actual.width}x${sample.example.actual.height} vs expected ${sample.example.expected.width}x${sample.example.expected.height}.`
    : '';
  const names = blocking
    .slice(0, 3)
    .map((issue) => `"${issue.textureName}"`)
    .join(', ');
  const suffix = blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
  return {
    code: 'invalid_state',
    message: UV_SCALE_MESSAGE(names, suffix, example, blocking.length !== 1),
    fix: UV_SCALE_FIX,
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
