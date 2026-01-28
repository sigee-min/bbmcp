import assert from 'node:assert/strict';

import { buildModelPipelineNextActions, buildTexturePipelineNextActions } from '../../src/proxy/nextActionHelpers';

// Model pipeline: warnings should add guide + validate + preview by default.
{
  const actions = buildModelPipelineNextActions({ warnings: ['anchor mismatch'] });
  assert.ok(actions.some((action) => action.type === 'read_resource'));
  assert.ok(actions.some((action) => action.type === 'call_tool' && action.tool === 'validate'));
  assert.ok(actions.some((action) => action.type === 'call_tool' && action.tool === 'render_preview'));
}

// Texture pipeline: paint without assignment should suggest assign + preview.
{
  const actions = buildTexturePipelineNextActions({
    textureLabels: ['painted_tex'],
    didPaint: true,
    didAssign: false,
    didPreview: false,
    assign: { includeAssignTool: true }
  });
  assert.ok(actions.some((action) => action.type === 'call_tool' && action.tool === 'assign_texture'));
  assert.ok(actions.some((action) => action.type === 'call_tool' && action.tool === 'render_preview'));
}
