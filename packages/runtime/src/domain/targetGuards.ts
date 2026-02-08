import type { ToolError } from '@ashfox/contracts/types/internal';
import { resolveTargetByIdOrName, resolveTargetLabel } from './sessionLookup';
import type { IdNameMismatchMessage } from './payloadValidation';
import { ensureIdNameMatch, ensureIdOrName } from './payloadValidation';
import { TARGET_NAME_AMBIGUOUS } from '../shared/messages/tool';

type TargetNamed = { id?: string | null; name: string };

type ResolveTargetOptions = {
  required: { message: string; fix?: string };
  mismatch?: {
    kind: string;
    plural: string;
    idLabel?: string;
    nameLabel?: string;
    message?: IdNameMismatchMessage;
  };
  notFound: (label: string) => string;
};

export const resolveTargetOrError = <T extends TargetNamed>(
  items: T[],
  id: string | undefined,
  name: string | undefined,
  options: ResolveTargetOptions
): { target?: T; error?: ToolError } => {
  const requiredErr = ensureIdOrName(id, name, options.required);
  if (requiredErr) return { error: requiredErr };
  if (options.mismatch) {
    const mismatchErr = ensureIdNameMatch(items, id, name, options.mismatch);
    if (mismatchErr) return { error: mismatchErr };
  }
  if (!id && name) {
    const matches = items.filter((item) => item.name === name);
    if (matches.length > 1) {
      const kind = options.mismatch?.kind ?? 'Target';
      return { error: { code: 'invalid_payload', message: TARGET_NAME_AMBIGUOUS(kind, name) } };
    }
  }
  const target = resolveTargetByIdOrName(items, id, name);
  if (!target) {
    return {
      error: { code: 'invalid_payload', message: options.notFound(resolveTargetLabel(id, name)) }
    };
  }
  return { target };
};




