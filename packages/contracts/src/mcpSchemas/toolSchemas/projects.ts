import type { JsonSchema } from '../types';
import { ENSURE_PROJECT_ACTIONS, FORMAT_KINDS } from '../constants';
import { metaProps, revisionProp } from '../schemas/common';
import { ensureProjectBaseProperties } from '../schemas/project';

export const projectToolSchemas: Record<string, JsonSchema> = {
  ensure_project: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ENSURE_PROJECT_ACTIONS },
      target: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' }
        }
      },
      format: { type: 'string', enum: FORMAT_KINDS },
      ...ensureProjectBaseProperties,
      force: { type: 'boolean' },
      ifRevision: revisionProp,
      ...metaProps
    }
  }
};


