import type { JsonSchema } from '../types';
import { cubeFaceSchema, metaProps, revisionProp } from '../schemas/common';
import { faceUvSchema } from '../schemas/model';
import { texturePresetSchema, uvPaintSchema } from '../schemas/texture';

export const textureToolSchemas: Record<string, JsonSchema> = {
  generate_texture_preset: {
    type: 'object',
    required: ['preset', 'width', 'height', 'uvUsageId'],
    additionalProperties: false,
    properties: {
      preset: texturePresetSchema,
      width: { type: 'number' },
      height: { type: 'number' },
      uvUsageId: { type: 'string' },
      name: { type: 'string' },
      targetId: { type: 'string' },
      targetName: { type: 'string' },
      mode: { type: 'string', enum: ['create', 'update'] },
      seed: { type: 'number' },
      palette: { type: 'array', items: { type: 'string' } },
      uvPaint: uvPaintSchema,
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  auto_uv_atlas: {
    type: 'object',
    additionalProperties: false,
    properties: {
      padding: { type: 'number' },
      apply: { type: 'boolean' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  set_project_texture_resolution: {
    type: 'object',
    required: ['width', 'height'],
    additionalProperties: false,
    properties: {
      width: { type: 'number' },
      height: { type: 'number' },
      modifyUv: { type: 'boolean' },
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
  set_face_uv: {
    type: 'object',
    required: ['faces'],
    additionalProperties: false,
    properties: {
      cubeId: { type: 'string' },
      cubeName: { type: 'string' },
      faces: faceUvSchema,
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  // apply_texture_spec and apply_uv_spec removed (legacy pipeline)
};
