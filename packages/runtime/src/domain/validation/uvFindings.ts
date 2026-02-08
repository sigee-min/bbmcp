import type { Snapshot, TextureUsage, ValidationFinding } from '../model';
import type { ValidationMessages } from './types';
import type { UvPolicyConfig } from '../uv/policy';
import { computeUvOverlapIssues, computeUvScaleIssues, formatOverlapExample, formatScaleExample } from '../uv/issues';

export const collectUvFindings = (args: {
  state: Snapshot;
  textureUsage?: TextureUsage;
  textureResolution?: { width: number; height: number };
  uvPolicy?: UvPolicyConfig;
  messages: ValidationMessages;
}): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const { textureResolution, textureUsage } = args;
  if (!textureResolution || !textureUsage) return findings;
  const { width, height } = textureResolution;

  args.state.cubes.forEach((cube) => {
    if (!cube.uv) return;
    const [u, v] = cube.uv;
    if (u < 0 || v < 0 || u >= width || v >= height) {
      findings.push({
        code: 'uv_out_of_bounds',
        message: args.messages.uvOutOfBounds(cube.name, u, v, width, height),
        severity: 'warning'
      });
    }
  });

  const unresolvedCount = textureUsage.unresolved?.length ?? 0;
  if (unresolvedCount > 0) {
    findings.push({
      code: 'texture_unresolved_refs',
      message: args.messages.textureUnresolvedRefs(unresolvedCount),
      severity: 'warning'
    });
  }
  textureUsage.textures.forEach((entry) => {
    if (entry.faceCount === 0) {
      findings.push({
        code: 'texture_unassigned',
        message: args.messages.textureUnassigned(entry.name),
        severity: 'warning'
      });
    }
  });
  textureUsage.textures.forEach((entry) => {
    entry.cubes.forEach((cube) => {
      cube.faces.forEach((face) => {
        const uv = face.uv;
        if (!uv) return;
        const [x1, y1, x2, y2] = uv;
        if (x1 < 0 || y1 < 0 || x2 > width || y2 > height) {
          findings.push({
            code: 'face_uv_out_of_bounds',
            message: args.messages.faceUvOutOfBounds(cube.name, face.face, width, height, x1, y1, x2, y2),
            severity: 'warning'
          });
        }
      });
    });
  });

  const overlaps = computeUvOverlapIssues(textureUsage);
  overlaps.forEach((overlap) => {
    const example = formatOverlapExample(overlap.example);
    findings.push({
      code: 'uv_overlap',
      message: args.messages.uvOverlap(overlap.textureName, overlap.conflictCount, example),
      severity: 'error'
    });
  });

  if (args.uvPolicy) {
    const scaleResult = computeUvScaleIssues(textureUsage, args.state.cubes, { width, height }, args.uvPolicy);
    scaleResult.issues.forEach((issue) => {
      const example = issue.example ? ` Example: ${formatScaleExample(issue.example)}.` : '';
      findings.push({
        code: 'uv_scale_mismatch',
        message: args.messages.uvScaleMismatch(issue.textureName, issue.mismatchCount, example),
        severity: 'error'
      });
    });
    if (scaleResult.mismatchedFaces > 0) {
      findings.push({
        code: 'uv_scale_mismatch_summary',
        message: args.messages.uvScaleMismatchSummary(scaleResult.mismatchedFaces, scaleResult.totalFaces),
        severity: 'info'
      });
    }
  }

  return findings;
};
