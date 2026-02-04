import type { JsonSchema } from '../types';
import { metaProps, numberArray, revisionProp, stateProps } from '../schemas/common';

export const modelToolSchemas: Record<string, JsonSchema> = {
  add_bone: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      parent: { type: 'string' },
      parentId: { type: 'string' },
      pivot: numberArray(3, 3),
      rotation: numberArray(3, 3),
      scale: numberArray(3, 3),
      visibility: { type: 'boolean' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  update_bone: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      newName: { type: 'string' },
      parent: { type: 'string' },
      parentId: { type: 'string' },
      parentRoot: { type: 'boolean' },
      pivot: numberArray(3, 3),
      rotation: numberArray(3, 3),
      scale: numberArray(3, 3),
      visibility: { type: 'boolean' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  delete_bone: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ids: { type: 'array', minItems: 1, items: { type: 'string' } },
      names: { type: 'array', minItems: 1, items: { type: 'string' } },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  add_cube: {
    type: 'object',
    required: ['name', 'from', 'to'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      from: numberArray(3, 3),
      to: numberArray(3, 3),
      origin: numberArray(3, 3),
      rotation: numberArray(3, 3),
      bone: { type: 'string' },
      boneId: { type: 'string' },
      inflate: { type: 'number' },
      mirror: { type: 'boolean' },
      visibility: { type: 'boolean' },
      boxUv: { type: 'boolean' },
      uvOffset: numberArray(2, 2),
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  update_cube: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      newName: { type: 'string' },
      bone: { type: 'string' },
      boneId: { type: 'string' },
      boneRoot: { type: 'boolean' },
      from: numberArray(3, 3),
      to: numberArray(3, 3),
      origin: numberArray(3, 3),
      rotation: numberArray(3, 3),
      inflate: { type: 'number' },
      mirror: { type: 'boolean' },
      visibility: { type: 'boolean' },
      boxUv: { type: 'boolean' },
      uvOffset: numberArray(2, 2),
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  delete_cube: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      ids: { type: 'array', minItems: 1, items: { type: 'string' } },
      names: { type: 'array', minItems: 1, items: { type: 'string' } },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  export: {
    type: 'object',
    required: ['format', 'destPath'],
    additionalProperties: false,
    properties: {
      format: { enum: ['java_block_item_json', 'gecko_geo_anim', 'animated_java'] },
      destPath: { type: 'string' },
      ...stateProps
    }
  },
  validate: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...stateProps
    }
  }
};
