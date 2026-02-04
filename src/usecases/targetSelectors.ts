import { ensureNonBlankString } from '../shared/payloadValidation';
import { resolveTargetOrError } from '../domain/targetGuards';
import type { IdNameMismatchMessage } from '../domain/payloadValidation';
import { fail, ok, UsecaseResult } from './result';

export type TargetSelector = { id?: string; name?: string };

type SelectorPayload = { id?: string; name?: string; ids?: string[]; names?: string[] };

type SelectorLabels = { id: string; name: string };

type RequiredMessage = { message: string; fix?: string };

type ResolveOptions = {
  required: RequiredMessage;
  mismatch?: {
    kind: string;
    plural: string;
    idLabel?: string;
    nameLabel?: string;
    message?: IdNameMismatchMessage;
  };
  notFound: (label: string) => string;
};

type TargetNamed = { id?: string | null; name: string };

export const collectTargetSelectors = (
  payload: SelectorPayload,
  labels: SelectorLabels,
  required: RequiredMessage
): UsecaseResult<TargetSelector[]> => {
  const selectors: TargetSelector[] = [];
  const idErr = ensureNonBlankString(payload.id, labels.id);
  if (idErr) return fail(idErr);
  const nameErr = ensureNonBlankString(payload.name, labels.name);
  if (nameErr) return fail(nameErr);
  if (payload.id || payload.name) {
    selectors.push({ id: payload.id, name: payload.name });
  }
  if (payload.ids) {
    for (const id of payload.ids) {
      const err = ensureNonBlankString(id, labels.id);
      if (err) return fail(err);
      selectors.push({ id });
    }
  }
  if (payload.names) {
    for (const name of payload.names) {
      const err = ensureNonBlankString(name, labels.name);
      if (err) return fail(err);
      selectors.push({ name });
    }
  }
  if (selectors.length === 0) {
    return fail({ code: 'invalid_payload', message: required.message, fix: required.fix });
  }
  return ok(selectors);
};

export const resolveTargetsFromSelectors = <T extends TargetNamed>(
  items: T[],
  selectors: TargetSelector[],
  options: ResolveOptions
): UsecaseResult<T[]> => {
  const targets = new Map<string, T>();
  for (const selector of selectors) {
    const resolved = resolveTargetOrError(items, selector.id, selector.name, options);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const key = target.id ? `id:${target.id}` : `name:${target.name}`;
    if (!targets.has(key)) targets.set(key, target);
  }
  if (targets.size === 0) {
    return fail({ code: 'invalid_payload', message: options.required.message, fix: options.required.fix });
  }
  return ok([...targets.values()]);
};

export const resolveTargets = <T extends TargetNamed>(
  items: T[],
  payload: SelectorPayload,
  labels: SelectorLabels,
  required: RequiredMessage,
  options: ResolveOptions
): UsecaseResult<T[]> => {
  const selectors = collectTargetSelectors(payload, labels, required);
  if (!selectors.ok) return selectors;
  return resolveTargetsFromSelectors(items, selectors.value, options);
};
