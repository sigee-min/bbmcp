import { JsonSchema } from '../types';
import { CUBE_FACE_DIRECTIONS, PROJECT_STATE_DETAILS } from '../../shared/toolConstants';

export const numberArray = (minItems: number, maxItems: number): JsonSchema => ({
  type: 'array',
  items: { type: 'number' },
  minItems,
  maxItems
});

export const emptyObject: JsonSchema = { type: 'object', additionalProperties: false };

export const cubeFaceSchema: JsonSchema = {
  type: 'string',
  enum: CUBE_FACE_DIRECTIONS
};

export const stateProps: Record<string, JsonSchema> = {
  includeState: { type: 'boolean' },
  ifRevision: { type: 'string' }
};

export const metaProps: Record<string, JsonSchema> = {
  includeState: { type: 'boolean' },
  includeDiff: { type: 'boolean' },
  diffDetail: { type: 'string', enum: PROJECT_STATE_DETAILS }
};
