import type { JsonSchema } from '../types';
import { metaProps, numberArray, revisionProp } from '../schemas/common';

const keyframeSchema: JsonSchema = {
  type: 'object',
  required: ['time', 'value'],
  additionalProperties: false,
  properties: {
    time: { type: 'number' },
    value: numberArray(3, 3),
    interp: { type: 'string', enum: ['linear', 'step', 'catmullrom'] }
  }
};

export const animationToolSchemas: Record<string, JsonSchema> = {
  create_animation_clip: {
    type: 'object',
    required: ['name', 'length', 'loop', 'fps'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      length: { type: 'number' },
      loop: { type: 'boolean' },
      fps: { type: 'number' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  update_animation_clip: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      newName: { type: 'string' },
      length: { type: 'number' },
      loop: { type: 'boolean' },
      fps: { type: 'number' },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  delete_animation_clip: {
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
  set_keyframes: {
    type: 'object',
    required: ['clip', 'bone', 'channel', 'keys'],
    additionalProperties: false,
    properties: {
      clipId: { type: 'string' },
      clip: { type: 'string' },
      bone: { type: 'string' },
      channel: { type: 'string', enum: ['rot', 'pos', 'scale'] },
      keys: { type: 'array', minItems: 1, maxItems: 1, items: keyframeSchema },
      ifRevision: revisionProp,
      ...metaProps
    }
  },
  set_trigger_keyframes: {
    type: 'object',
    required: ['clip', 'channel', 'keys'],
    additionalProperties: false,
    properties: {
      clipId: { type: 'string' },
      clip: { type: 'string' },
      channel: { type: 'string', enum: ['sound', 'particle', 'timeline'] },
      keys: {
        type: 'array',
        minItems: 1,
        maxItems: 1,
        items: {
          type: 'object',
          required: ['time', 'value'],
          additionalProperties: false,
          properties: {
            time: { type: 'number' },
            value: {}
          }
        }
      },
      ifRevision: revisionProp,
      ...metaProps
    }
  }
};
