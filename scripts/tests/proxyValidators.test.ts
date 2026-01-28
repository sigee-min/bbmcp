import assert from 'node:assert/strict';

import { toolSchemas } from '../../src/mcp/toolSchemas';
import { validateSchema } from '../../src/mcp/validation';
import type { ModelPipelinePayload, TexturePipelinePayload } from '../../src/spec';
import { validateModelPipeline, validateTexturePipeline } from '../../src/proxy/validators';
import { DEFAULT_LIMITS, unsafePayload } from './helpers';

const limits = DEFAULT_LIMITS;

// Runtime validator sanity: invalid bones array should fail.
{
  const payload: ModelPipelinePayload = unsafePayload({ model: { bones: 'nope' } });
  const res = validateModelPipeline(payload, limits);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// planOnly cannot combine with ensureProject.
{
  const payload: ModelPipelinePayload = {
    model: { bones: [] },
    planOnly: true,
    ensureProject: unsafePayload({ name: 'tmp', match: 'format', onMissing: 'create' })
  };
  const res = validateModelPipeline(payload, limits);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Runtime validator sanity: empty pipeline should fail with invalid_payload.
{
  const payload: TexturePipelinePayload = {};
  const res = validateTexturePipeline(payload, limits);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'invalid_payload');
  }
}

// Schema-level contract: unknown rigTemplate rejected.
{
  const res = validateSchema(toolSchemas.model_pipeline, { model: { rigTemplate: 'nope' } });
  assert.equal(res.ok, false);
}

// Schema-level contract: unknown preset name rejected.
{
  const res = validateSchema(toolSchemas.texture_pipeline, {
    presets: [{ preset: 'nope', width: 16, height: 16 }]
  });
  assert.equal(res.ok, false);
}
