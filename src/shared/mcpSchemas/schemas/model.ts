import type { JsonSchema } from '../types';
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
