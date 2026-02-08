import type { Snapshot, ValidationFinding } from './model';
import { collectModelFindings } from './validation/modelFindings';
import { collectMeshFindings } from './validation/meshFindings';
import { collectTextureFindings } from './validation/textureFindings';
import { collectUvFindings } from './validation/uvFindings';
import type { ValidationContext, ValidationMessages } from './validation/types';

export type { ValidationContext, ValidationMessages } from './validation/types';

export function validateSnapshot(
  state: Snapshot,
  context: ValidationContext,
  messages: ValidationMessages
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const { limits, textures, textureResolution, textureUsage, uvPolicy } = context;

  findings.push(...collectModelFindings(state, limits, messages));
  findings.push(...collectMeshFindings(state, messages));
  findings.push(...collectTextureFindings({ textures, limits, textureResolution, messages }));
  findings.push(
    ...collectUvFindings({
      state,
      textureUsage,
      textureResolution,
      uvPolicy,
      messages
    })
  );

  return findings;
}



