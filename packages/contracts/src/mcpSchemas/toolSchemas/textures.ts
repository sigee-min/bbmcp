import type { JsonSchema } from '../types';
import { cubeFaceSchema, metaProps, revisionProp } from '../schemas/common';
import { textureOpSchema } from '../schemas/texture';

export const textureToolSchemas: Record<string, JsonSchema> = {
  preflight_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      textureId: { type: 'string' },
      textureName: { type: 'string' },
      includeUsage: { type: 'boolean' }
    }
  },
  paint_faces: {
    type: 'object',
    required: ['target', 'op'],
    additionalProperties: false,
    anyOf: [
      {
        type: 'object',
        properties: {
          coordSpace: { type: 'string', enum: ['face'] }
        }
      },
      {
        type: 'object',
        required: ['coordSpace', 'width', 'height'],
        properties: {
          coordSpace: { type: 'string', enum: ['texture'] }
        }
      }
    ],
    properties: {
      textureId: { type: 'string' },
      textureName: { type: 'string' },
      target: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cubeId: { type: 'string' },
          cubeName: { type: 'string' },
          face: {
            ...cubeFaceSchema,
            description: 'Optional face filter. Omit to apply to all cube faces.'
          }
        }
      },
      coordSpace: { type: 'string', enum: ['face', 'texture'] },
      width: { type: 'number' },
      height: { type: 'number' },
      op: textureOpSchema,
      mapping: { type: 'string', enum: ['stretch', 'tile'] },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  delete_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  assign_texture: {
    type: 'object',
    additionalProperties: false,
    properties: {
      textureId: { type: 'string' },
      textureName: { type: 'string' },
      cubeIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Limit to these cube ids. If cubeNames is also provided, both must match.'
      },
      cubeNames: {
        type: 'array',
        items: { type: 'string' },
        description: 'Limit to these cube names. If cubeIds is also provided, both must match.'
      },
      faces: { type: 'array', minItems: 1, items: cubeFaceSchema },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  // apply_texture_spec and apply_uv_spec are intentionally omitted from the current schema set.
};
