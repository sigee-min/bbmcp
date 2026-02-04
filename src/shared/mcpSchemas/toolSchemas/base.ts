import type { JsonSchema } from '../types';
import { PROJECT_STATE_DETAILS } from '../../toolConstants';
import { emptyObject } from '../schemas/common';

export const baseToolSchemas: Record<string, JsonSchema> = {
  list_capabilities: emptyObject,
  get_project_state: {
    type: 'object',
    additionalProperties: false,
    properties: {
      detail: { type: 'string', enum: PROJECT_STATE_DETAILS },
      includeUsage: {
        type: 'boolean',
        description: 'Include textureUsage in the response (defaults to true when detail=full).'
      }
    }
  },
  read_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      saveToTmp: { type: 'boolean' },
      tmpName: { type: 'string' },
      tmpPrefix: { type: 'string' }
    }
  },
  export_trace_log: {
    type: 'object',
    additionalProperties: false,
    properties: {
      mode: { type: 'string', enum: ['auto', 'writeFile', 'export'] },
      destPath: { type: 'string' },
      fileName: { type: 'string' }
    }
  },
  reload_plugins: {
    type: 'object',
    required: ['confirm'],
    additionalProperties: false,
    properties: {
      confirm: { type: 'boolean' },
      delayMs: { type: 'number' }
    }
  },
  preflight_texture: {
    type: 'object',
    description:
      'Build a UV mapping table and compute uvUsageId. Call WITHOUT texture filters for a stable uvUsageId. Use this before generate_texture_preset or manual UV edits.',
    additionalProperties: false,
    properties: {
      textureId: { type: 'string', description: 'Optional: filter the report to one texture id.' },
      textureName: { type: 'string', description: 'Optional: filter the report to one texture name.' },
      includeUsage: { type: 'boolean', description: 'Include full textureUsage mapping table (can be large).' }
    }
  }
};
