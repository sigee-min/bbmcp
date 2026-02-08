import type { BlockbenchGlobals, PreviewItem } from '../../../types/blockbench';

export const renderViewportPreviews = (globals: BlockbenchGlobals): number => {
  const registry = globals.Preview;
  const selected = registry?.selected;
  const all = registry?.all ?? [];
  const candidates = [selected, ...all].filter((entry): entry is PreviewItem => Boolean(entry));
  const rendered = new Set<PreviewItem>();
  for (const preview of candidates) {
    if (rendered.has(preview)) continue;
    if (typeof preview.render !== 'function') continue;
    preview.render();
    rendered.add(preview);
  }
  return rendered.size;
};
