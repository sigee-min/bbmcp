const fallback = (title: string, file: string) =>
  `# ${title}\n\nGuide content is packaged in docs/guides/${file}.md.`;

export const GUIDE_FALLBACKS: Record<string, string> = {
  'modeling-workflow': fallback('Modeling Workflow (Low-level)', 'modeling-workflow'),
  rigging: fallback('Rigging Guide (Animation-Ready)', 'rigging'),
  'animation-workflow': fallback('Animation Workflow (Low-level)', 'animation-workflow'),
  'texture-workflow': fallback('Texture Workflow (UV-first)', 'texture-workflow'),
  'uv-atlas': fallback('UV Atlas Guide', 'uv-atlas'),
  'texture-spec': fallback('Texture + UV Spec (Summary)', 'texture-spec'),
  'llm-texture-strategy': fallback('LLM Texture Strategy (Summary)', 'llm-texture-strategy'),
  'vision-fallback': fallback('Vision Fallback (Preview + Texture)', 'vision-fallback'),
  'entity-workflow': fallback('Entity Workflow (GeckoLib-first)', 'entity-workflow')
};
