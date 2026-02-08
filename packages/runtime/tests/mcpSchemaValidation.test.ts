import assert from 'node:assert/strict';

import type { JsonSchema } from '../../contracts/src/mcpSchemas/types';
import { validateSchema } from '../../contracts/src/mcpSchemas/validation';

{
  const schema: JsonSchema = { type: 'object' };
  const result = validateSchema(schema, 'not-object');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'type');
    assert.equal(result.path, '$');
  }
}

{
  const schema: JsonSchema = { type: 'string', enum: ['a', 'b'] };
  const result = validateSchema(schema, 'c');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'enum');
    assert.equal(Array.isArray(result.details?.candidates), true);
  }
}

{
  const schema: JsonSchema = {
    anyOf: [
      {
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
        additionalProperties: false
      },
      {
        type: 'object',
        properties: { b: { type: 'number' } },
        required: ['b'],
        additionalProperties: false
      }
    ]
  };
  const result = validateSchema(schema, { c: true });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'anyOf');
    assert.equal(Array.isArray(result.details?.candidates), true);
  }
}

{
  const schema: JsonSchema = { type: 'array', minItems: 2 };
  const result = validateSchema(schema, [1]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'minItems');
    assert.equal(result.path, '$');
  }
}

{
  const schema: JsonSchema = { type: 'array', maxItems: 1 };
  const result = validateSchema(schema, [1, 2]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'maxItems');
    assert.equal(result.path, '$');
  }
}

{
  const schema: JsonSchema = { type: 'array', items: { type: 'number' } };
  const result = validateSchema(schema, [1, 'x']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'type');
    assert.equal(result.path, '$[1]');
  }
}

{
  const schema: JsonSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false
  };
  const result = validateSchema(schema, {});
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'required');
    assert.equal(result.path, '$.name');
  }
}

{
  const schema: JsonSchema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    additionalProperties: false
  };
  const result = validateSchema(schema, { name: 'ok', extra: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'additionalProperties');
    assert.equal(result.path, '$.extra');
  }
}

{
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'number' } },
          required: ['id'],
          additionalProperties: false
        }
      }
    },
    required: ['items'],
    additionalProperties: false
  };
  const result = validateSchema(schema, { items: [{ id: 1 }, { id: 2 }] });
  assert.deepEqual(result, { ok: true });
}
