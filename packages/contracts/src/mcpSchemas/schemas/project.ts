import type { JsonSchema } from '../types';
import {
  ENSURE_PROJECT_MATCHES,
  ENSURE_PROJECT_ON_MISMATCH,
  ENSURE_PROJECT_ON_MISSING
} from '../constants';

export const ensureProjectBaseProperties: Record<string, JsonSchema> = {
  name: { type: 'string' },
  match: { type: 'string', enum: ENSURE_PROJECT_MATCHES },
  onMismatch: { type: 'string', enum: ENSURE_PROJECT_ON_MISMATCH },
  onMissing: { type: 'string', enum: ENSURE_PROJECT_ON_MISSING },
  confirmDiscard: { type: 'boolean' },
  uvPixelsPerBlock: { type: 'number' },
  dialog: { type: 'object', additionalProperties: true }
};


