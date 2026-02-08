import { ResourceContent, ResourceTemplate } from '../../ports/resources';
import { GUIDE_FALLBACKS } from './guideFallbacks';
import { loadGuideMarkdown } from './guideLoader';

export const GUIDE_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'ashfox://guide/{name}',
    name: 'Guide',
    mimeType: 'text/markdown',
    description: 'Static guides and examples for ashfox workflows.'
  }
];

export const GUIDE_RESOURCES: ResourceContent[] = [
  {
    uri: 'ashfox://guide/modeling-workflow',
    name: 'Modeling Workflow Guide',
    mimeType: 'text/markdown',
    description: 'Low-level modeling workflow using add_bone/add_cube.',
    text: loadGuideMarkdown('modeling-workflow', GUIDE_FALLBACKS['modeling-workflow'])
  },
  {
    uri: 'ashfox://guide/rigging',
    name: 'Rigging Guide',
    mimeType: 'text/markdown',
    description: 'Root-based bone hierarchy guidelines for animation-ready rigs.',
    text: loadGuideMarkdown('rigging', GUIDE_FALLBACKS.rigging)
  },
  {
    uri: 'ashfox://guide/animation-workflow',
    name: 'Animation Workflow Guide',
    mimeType: 'text/markdown',
    description: 'Low-level animation workflow using clips + per-bone keyframes.',
    text: loadGuideMarkdown('animation-workflow', GUIDE_FALLBACKS['animation-workflow'])
  },
  {
    uri: 'ashfox://guide/texture-workflow',
    name: 'Texture Workflow Guide',
    mimeType: 'text/markdown',
    description: 'Auto-UV texture workflow with direct ops painting.',
    text: loadGuideMarkdown('texture-workflow', GUIDE_FALLBACKS['texture-workflow'])
  },
  {
    uri: 'ashfox://guide/uv-atlas',
    name: 'UV Atlas Guide',
    mimeType: 'text/markdown',
    description: 'Internal auto UV atlas packing and resolution growth strategy.',
    text: loadGuideMarkdown('uv-atlas', GUIDE_FALLBACKS['uv-atlas'])
  },
  {
    uri: 'ashfox://guide/texture-spec',
    name: 'Texture + UV Spec',
    mimeType: 'text/markdown',
    description: 'Canonical UV and texturing invariants (internal UV tools).',
    text: loadGuideMarkdown('texture-spec', GUIDE_FALLBACKS['texture-spec'])
  },
  {
    uri: 'ashfox://guide/llm-texture-strategy',
    name: 'LLM Texture Strategy',
    mimeType: 'text/markdown',
    description: 'LLM-oriented workflow with internal UV management.',
    text: loadGuideMarkdown('llm-texture-strategy', GUIDE_FALLBACKS['llm-texture-strategy'])
  },
  {
    uri: 'ashfox://guide/vision-fallback',
    name: 'Vision Fallback Guide',
    mimeType: 'text/markdown',
    description: 'Preview/texture image snapshot workflow for manual uploads.',
    text: loadGuideMarkdown('vision-fallback', GUIDE_FALLBACKS['vision-fallback'])
  },
  {
    uri: 'ashfox://guide/entity-workflow',
    name: 'Entity Workflow Guide',
    mimeType: 'text/markdown',
    description: 'GeckoLib-first entity workflow with version targeting.',
    text: loadGuideMarkdown('entity-workflow', GUIDE_FALLBACKS['entity-workflow'])
  }
];











