import type { ToolError } from '@ashfox/contracts/types/internal';

export const ensureNonBlankString = (
  value: unknown,
  options: { message: string; fix?: string }
): ToolError | null => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return { code: 'invalid_payload', message: options.message, ...(options.fix ? { fix: options.fix } : {}) };
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

export type IdNameMismatchArgs = {
  kind: string;
  plural: string;
  idLabel: string;
  nameLabel: string;
  id: string;
  name: string;
};

export type IdNameMismatchMessage = (args: IdNameMismatchArgs) => string;

export const ensureIdNameMatch = <T extends IdNameItem>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options: { kind: string; plural: string; idLabel?: string; nameLabel?: string; message?: IdNameMismatchMessage }
): ToolError | null => {
  if (!id || !name) return null;
  const byId = items.find((item) => item.id === id);
  const byName = items.find((item) => item.name === name);
  if (byId && byName && byId !== byName) {
    const idLabel = options.idLabel ?? 'id';
    const nameLabel = options.nameLabel ?? 'name';
    return {
      code: 'invalid_payload',
      message:
        options.message?.({
          kind: options.kind,
          plural: options.plural,
          idLabel,
          nameLabel,
          id,
          name
        }) ?? `${options.kind} ${idLabel}/${nameLabel} mismatch.`
    };
  }
  return null;
};




