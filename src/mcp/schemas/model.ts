import { JsonSchema } from '../types';
import { RIG_TEMPLATE_KINDS } from '../../shared/toolConstants';
import { numberArray } from './common';

export const faceUvSchema: JsonSchema = {
  type: 'object',
  description:
    'Per-face UV map. Keys are cube faces (north/south/east/west/up/down). Values are [x1,y1,x2,y2] in texture pixels. UVs must fit within the current project textureResolution.',
  minProperties: 1,
  additionalProperties: false,
  properties: {
    north: numberArray(4, 4),
    south: numberArray(4, 4),
    east: numberArray(4, 4),
    west: numberArray(4, 4),
    up: numberArray(4, 4),
    down: numberArray(4, 4)
  }
};

export const modelBoneSpecSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    parentId: { type: 'string' },
    pivot: numberArray(3, 3),
    pivotAnchorId: { type: 'string' },
    rotation: numberArray(3, 3),
    scale: numberArray(3, 3),
    visibility: { type: 'boolean' }
  }
};

export const modelCubeSpecSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    parentId: { type: 'string' },
    from: numberArray(3, 3),
    to: numberArray(3, 3),
    center: numberArray(3, 3),
    size: numberArray(3, 3),
    origin: numberArray(3, 3),
    originAnchorId: { type: 'string' },
    centerAnchorId: { type: 'string' },
    rotation: numberArray(3, 3),
    inflate: { type: 'number' },
    mirror: { type: 'boolean' },
    visibility: { type: 'boolean' },
    boxUv: { type: 'boolean' },
    uvOffset: numberArray(2, 2)
  }
};

export const modelInstanceSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: ['mirror', 'repeat', 'radial'] },
    sourceCubeId: { type: 'string' },
    axis: { type: 'string', enum: ['x', 'y', 'z'] },
    about: { type: 'number' },
    newId: { type: 'string' },
    newName: { type: 'string' },
    count: { type: 'number' },
    delta: numberArray(3, 3),
    prefix: { type: 'string' },
    radius: { type: 'number' },
    center: numberArray(3, 3),
    startAngle: { type: 'number' }
  }
};

export const modelAnchorSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    target: {
      type: 'object',
      additionalProperties: false,
      properties: {
        boneId: { type: 'string' },
        cubeId: { type: 'string' }
      }
    },
    offset: numberArray(3, 3)
  }
};

export const modelSpecSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    units: { type: 'string', enum: ['px'] },
    rigTemplate: { type: 'string', enum: RIG_TEMPLATE_KINDS },
    bones: { type: 'array', items: modelBoneSpecSchema },
    cubes: { type: 'array', items: modelCubeSpecSchema },
    instances: { type: 'array', items: modelInstanceSchema },
    anchors: { type: 'array', items: modelAnchorSchema },
    policies: {
      type: 'object',
      additionalProperties: false,
      properties: {
        idPolicy: {
          type: 'string',
          enum: ['explicit', 'stable_path', 'hash'],
          default: 'stable_path',
          description: 'Id policy for bones/cubes. Defaults to stable_path; use explicit to require ids.'
        },
        defaultParentId: { type: 'string' },
        enforceRoot: { type: 'boolean' },
        snap: {
          type: 'object',
          additionalProperties: false,
          properties: { grid: { type: 'number' } }
        },
        bounds: {
          type: 'object',
          additionalProperties: false,
          properties: {
            min: numberArray(3, 3),
            max: numberArray(3, 3)
          }
        }
      }
    }
  }
};
