import type { Limits, Snapshot, ValidationFinding } from '../model';
import type { ValidationMessages } from './types';
import { findCubeContainments, findDuplicates } from './geometry';

export const collectModelFindings = (
  state: Snapshot,
  limits: Limits,
  messages: ValidationMessages
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];

  const boneNames = new Set(state.bones.map((b) => b.name));
  if (state.bones.length === 0) {
    findings.push({ code: 'no_bones', message: messages.noBones, severity: 'warning' });
  }

  state.cubes.forEach((c) => {
    if (!boneNames.has(c.bone)) {
      findings.push({
        code: 'orphan_cube',
        message: messages.orphanCube(c.name, c.bone),
        severity: 'error'
      });
    }
  });

  findDuplicates(state.bones.map((b) => b.name)).forEach((name) => {
    findings.push({ code: 'duplicate_bone', message: messages.duplicateBone(name), severity: 'error' });
  });

  findDuplicates(state.cubes.map((c) => c.name)).forEach((name) => {
    findings.push({ code: 'duplicate_cube', message: messages.duplicateCube(name), severity: 'error' });
  });

  findCubeContainments(state.cubes).forEach((pair) => {
    findings.push({
      code: 'cube_containment',
      message: messages.cubeContainment(pair.inner, pair.outer),
      severity: 'warning'
    });
  });

  if (state.cubes.length > limits.maxCubes) {
    findings.push({
      code: 'max_cubes_exceeded',
      message: messages.maxCubesExceeded(state.cubes.length, limits.maxCubes),
      severity: 'error'
    });
  }

  state.animations.forEach((anim) => {
    if (anim.length > limits.maxAnimationSeconds) {
      findings.push({
        code: 'animation_too_long',
        message: messages.animationTooLong(anim.name, limits.maxAnimationSeconds),
        severity: 'error'
      });
    }
  });

  return findings;
};
