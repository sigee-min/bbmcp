import type { ToolError } from '../types';
import { ID_NAME_MISMATCH_MESSAGE, NON_EMPTY_STRING_MESSAGE } from '../shared/messages';

export const isBlankString = (value?: string): boolean => typeof value === 'string' && value.trim().length === 0;

export const ensureNonBlankString = (value: unknown, label: string): ToolError | null => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return { code: 'invalid_payload', message: NON_EMPTY_STRING_MESSAGE(label) };
  }
  return null;
};

export const ensureIdOrName = (
  id: unknown,
  name: unknown,
  options: { message: string; fix?: string }
): ToolError | null => {
  if (!id && !name) {
    return {
      code: 'invalid_payload',
      message: options.message,
      ...(options.fix ? { fix: options.fix } : {})
    };
  }
  return null;
};

type IdNameItem = { id?: string | null; name: string };

export const ensureIdNameMatch = <T extends IdNameItem>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options: { kind: string; plural: string; idLabel?: string; nameLabel?: string }
): ToolError | null => {
  if (!id || !name) return null;
  const byId = items.find((item) => item.id === id);
  const byName = items.find((item) => item.name === name);
  if (byId && byName && byId !== byName) {
    const idLabel = options.idLabel ?? 'id';
    const nameLabel = options.nameLabel ?? 'name';
    return {
      code: 'invalid_payload',
      message: ID_NAME_MISMATCH_MESSAGE(options.kind, idLabel, nameLabel, options.plural, id, name)
    };
  }
  return null;
};
