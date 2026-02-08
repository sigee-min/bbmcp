import type { JsonSchema } from '../types';
import { PREVIEW_MODES, PREVIEW_OUTPUTS } from '../constants';
import { numberArray, stateProps } from '../schemas/common';

export const previewToolSchemas: Record<string, JsonSchema> = {
  render_preview: {
    type: 'object',
    required: ['mode'],
    additionalProperties: false,
    properties: {
      mode: { enum: PREVIEW_MODES },
      angle: numberArray(2, 3),
      clip: { type: 'string' },
      timeSeconds: { type: 'number' },
      durationSeconds: { type: 'number' },
      fps: { type: 'number' },
      output: { enum: PREVIEW_OUTPUTS },
      saveToTmp: { type: 'boolean' },
      tmpName: { type: 'string' },
      tmpPrefix: { type: 'string' },
      ...stateProps
    }
  }
};


