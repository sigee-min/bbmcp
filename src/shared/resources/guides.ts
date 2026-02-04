import { ResourceContent, ResourceTemplate } from '../../ports/resources';
import { GUIDE_FALLBACKS } from './guideFallbacks';
import { loadGuideMarkdown } from './guideLoader';

export const GUIDE_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'bbmcp://guide/{name}',
    name: 'Guide',
    mimeType: 'text/markdown',
    description: 'Static guides and examples for bbmcp workflows.'
  }
];

export const GUIDE_RESOURCES: ResourceContent[] = [
  {
    uri: 'bbmcp://guide/modeling-workflow',
    name: 'Modeling Workflow Guide',
    mimeType: 'text/markdown',
    description: 'Low-level modeling workflow using add_bone/add_cube.',
    text: loadGuideMarkdown('modeling-workflow', GUIDE_FALLBACKS['modeling-workflow'])
  },
  {
    uri: 'bbmcp://guide/rigging',
    name: 'Rigging Guide',
    mimeType: 'text/markdown',
    description: 'Root-based bone hierarchy guidelines for animation-ready rigs.',
    text: loadGuideMarkdown('rigging', GUIDE_FALLBACKS.rigging)
  },
  {
    uri: 'bbmcp://guide/animation-workflow',
    name: 'Animation Workflow Guide',
    mimeType: 'text/markdown',
    description: 'Low-level animation workflow using clips + per-bone keyframes.',
    text: loadGuideMarkdown('animation-workflow', GUIDE_FALLBACKS['animation-workflow'])
  },
  {
    uri: 'bbmcp://guide/texture-workflow',
    name: 'Texture Workflow Guide',
    mimeType: 'text/markdown',
    description: 'UV-first texture workflow with uvPaint and presets.',
    text: loadGuideMarkdown('texture-workflow', GUIDE_FALLBACKS['texture-workflow'])
  },
  {
    uri: 'bbmcp://guide/uv-atlas',
    name: 'UV Atlas Guide',
    mimeType: 'text/markdown',
    description: 'Auto atlas packing and resolution growth strategy.',
    text: loadGuideMarkdown('uv-atlas', GUIDE_FALLBACKS['uv-atlas'])
  },
  {
    uri: 'bbmcp://guide/texture-spec',
    name: 'Texture + UV Spec',
    mimeType: 'text/markdown',
    description: 'Canonical UV and texturing invariants.',
    text: loadGuideMarkdown('texture-spec', GUIDE_FALLBACKS['texture-spec'])
  },
  {
    uri: 'bbmcp://guide/llm-texture-strategy',
    name: 'LLM Texture Strategy',
    mimeType: 'text/markdown',
    description: 'LLM-oriented workflow and recovery loop.',
    text: loadGuideMarkdown('llm-texture-strategy', GUIDE_FALLBACKS['llm-texture-strategy'])
  },
  {
    uri: 'bbmcp://guide/vision-fallback',
    name: 'Vision Fallback Guide',
    mimeType: 'text/markdown',
    description: 'Preview/texture image snapshot workflow for manual uploads.',
    text: loadGuideMarkdown('vision-fallback', GUIDE_FALLBACKS['vision-fallback'])
  },
  {
    uri: 'bbmcp://guide/entity-workflow',
    name: 'Entity Workflow Guide',
    mimeType: 'text/markdown',
    description: 'GeckoLib-first entity workflow with version targeting.',
    text: loadGuideMarkdown('entity-workflow', GUIDE_FALLBACKS['entity-workflow'])
  }
];










