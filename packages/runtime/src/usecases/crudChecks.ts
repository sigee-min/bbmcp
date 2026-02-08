import type { ToolError } from '@ashfox/contracts/types/internal';
import { createId } from '../shared/id';

type NamedEntity = { name: string; id?: string | null };

export const ensureNameAvailable = (
  items: NamedEntity[],
  name: string,
  message: (value: string) => string
): ToolError | null =>
  items.some((item) => item.name === name)
    ? { code: 'invalid_payload', message: message(name) }
    : null;

export const ensureIdAvailable = (
  items: NamedEntity[],
  id: string,
  message: (value: string) => string
): ToolError | null =>
  items.some((item) => item.id && item.id === id)
    ? { code: 'invalid_payload', message: message(id) }
    : null;

export const ensureRenameAvailable = (
  items: NamedEntity[],
  newName: string | undefined,
  currentName: string,
  message: (value: string) => string
): ToolError | null => {
  if (!newName || newName === currentName) return null;
  const conflict = items.some((item) => item.name === newName && item.name !== currentName);
  return conflict ? { code: 'invalid_payload', message: message(newName) } : null;
};

export const resolveEntityId = (
  existingId: string | undefined | null,
  requestedId: string | undefined,
  prefix: string
): string => requestedId ?? existingId ?? createId(prefix);

