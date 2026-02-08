import type { DomainError, DomainResult } from '../result';
import type { UvAtlasMessages } from './atlas';
import type { Group } from './atlasGroups';

export type Placement = {
  group: Group;
  x: number;
  y: number;
};

export const packGroups = (
  groups: Group[],
  width: number,
  height: number,
  padding: number,
  messages: UvAtlasMessages
): DomainResult<Placement[]> => {
  const sorted = [...groups].sort((a, b) => {
    if (b.height !== a.height) return b.height - a.height;
    if (b.width !== a.width) return b.width - a.width;
    return a.key.localeCompare(b.key);
  });
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const placements: Placement[] = [];
  for (const group of sorted) {
    if (group.width > width || group.height > height) {
      return overflow(width, height, group.width, group.height, messages);
    }
    if (x + group.width > width) {
      x = 0;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    if (y + group.height > height) {
      return overflow(width, height, group.width, group.height, messages);
    }
    placements.push({ group, x, y });
    x += group.width + padding;
    rowHeight = Math.max(rowHeight, group.height);
  }
  return { ok: true, data: placements };
};

const overflow = (
  width: number,
  height: number,
  rectWidth: number,
  rectHeight: number,
  messages: UvAtlasMessages
): DomainResult<never> =>
  fail('invalid_state', messages.overflow, {
    reason: 'atlas_overflow',
    resolution: { width, height },
    rect: { width: rectWidth, height: rectHeight }
  });

const fail = (code: DomainError['code'], message: string, details?: Record<string, unknown>): DomainResult<never> => ({
  ok: false,
  error: { code, message, details }
});
