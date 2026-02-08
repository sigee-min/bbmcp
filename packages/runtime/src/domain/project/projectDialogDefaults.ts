import type { FormatKind } from '@ashfox/contracts/types/internal';

type DialogDefaultsInput = {
  format: FormatKind;
  formatId: string | null;
  name: string;
};

const JAVA_BLOCK_PARENT_BLOCK = 'block/cube';
const JAVA_BLOCK_PARENT_ITEM = 'item/generated';

const guessJavaParent = (name: string): string => {
  const normalized = name.toLowerCase();
  if (normalized.includes('item')) return JAVA_BLOCK_PARENT_ITEM;
  return JAVA_BLOCK_PARENT_BLOCK;
};

export const buildProjectDialogDefaults = (input: DialogDefaultsInput): Record<string, unknown> => {
  const defaults: Record<string, unknown> = {};
  const { format, formatId, name } = input;
  if (formatId) {
    defaults.format = formatId;
  } else if (format) {
    defaults.format = format;
  }
  if (format === 'Java Block/Item') {
    defaults.parent = guessJavaParent(name);
  }
  return defaults;
};

