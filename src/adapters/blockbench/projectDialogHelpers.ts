import type { FormatKind, ToolError } from '@ashfox/contracts/types/internal';
import { ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED } from '../../shared/messages';
import { readGlobals } from './blockbenchUtils';

type AutoDialogOptions = {
  dialog?: Record<string, unknown>;
  formatId?: string;
  formatKind?: FormatKind;
};

export const tryAutoConfirmProjectDialog = (
  projectName: string,
  options?: AutoDialogOptions
): { ok: true } | { ok: false; error: ToolError } => {
  const dialogApi = readGlobals().Dialog;
  const dialog = dialogApi?.open;
  if (!dialog || typeof dialog.getFormResult !== 'function') {
    return { ok: true };
  }
  const current = dialog.getFormResult() ?? {};
  const allowed = new Set(Object.keys(current));
  const values: Record<string, unknown> = { ...current };
  if (options?.dialog) {
    for (const [key, value] of Object.entries(options.dialog)) {
      if (allowed.has(key)) values[key] = value;
    }
  }
  if (allowed.has('name') && !('name' in (options?.dialog ?? {}))) {
    values.name = projectName;
  } else if (allowed.has('project_name') && !('project_name' in (options?.dialog ?? {}))) {
    values.project_name = projectName;
  }
  if (allowed.has('format') && isEmptyDialogValue(values.format)) {
    const formatValue = coerceDialogSelectValue(current.format, options?.formatId, options?.formatKind);
    if (formatValue !== undefined) values.format = formatValue;
  }
  if (allowed.has('parent') && isEmptyDialogValue(values.parent) && options?.dialog?.parent !== undefined) {
    values.parent = options.dialog.parent;
  }
  if (typeof dialog.setFormValues === 'function') {
    dialog.setFormValues(values, true);
  }
  if (typeof dialog.confirm === 'function') dialog.confirm();
  if (dialogApi?.open === dialog) {
    const remaining = dialog.getFormResult?.() ?? {};
    const missing = getMissingFields(remaining);
    const fallbackValues = { ...values };
    let appliedFallback = false;
    if (missing.includes('format') && allowed.has('format') && options?.formatKind) {
      const fallbackFormat = coerceDialogSelectValue(current.format, undefined, options.formatKind);
      if (fallbackFormat !== undefined && !isSameDialogValue(fallbackValues.format, fallbackFormat)) {
        fallbackValues.format = fallbackFormat;
        appliedFallback = true;
      }
    }
    if (missing.includes('parent') && allowed.has('parent') && options?.dialog?.parent !== undefined) {
      if (!isSameDialogValue(fallbackValues.parent, options.dialog.parent)) {
        fallbackValues.parent = options.dialog.parent;
        appliedFallback = true;
      }
    }
    if (appliedFallback) {
      if (typeof dialog.setFormValues === 'function') {
        dialog.setFormValues(fallbackValues, true);
      }
      if (typeof dialog.confirm === 'function') dialog.confirm();
      if (dialogApi?.open !== dialog) {
        return { ok: true };
      }
    }
    const finalRemaining = dialog.getFormResult?.() ?? remaining;
    const finalMissing = getMissingFields(finalRemaining);
    const attemptedValues = appliedFallback ? fallbackValues : values;
    return {
      ok: false,
      error: {
        code: 'invalid_state',
        message: ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
        fix: `Provide ensure_project.dialog values for: ${finalMissing.join(', ')}. Use the exact field keys.`,
        details: { fields: finalRemaining, missing: finalMissing, attempted: pickDialogFields(attemptedValues, finalMissing) }
      }
    };
  }
  return { ok: true };
};

const isEmptyDialogValue = (value: unknown): boolean =>
  value === '' || value === null || value === undefined;

const getMissingFields = (fields: Record<string, unknown>): string[] =>
  Object.entries(fields)
    .filter(([, value]) => isEmptyDialogValue(value))
    .map(([key]) => key);

const isSameDialogValue = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
};

const coerceDialogSelectValue = (
  currentValue: unknown,
  desiredId?: string,
  desiredLabel?: string
): unknown => {
  const desired = desiredId ?? desiredLabel;
  if (desired === undefined) return undefined;
  if (currentValue && typeof currentValue === 'object') {
    const record = { ...(currentValue as Record<string, unknown>) };
    if ('id' in record && desiredId) record.id = desiredId;
    if ('value' in record && desiredId) record.value = desiredId;
    if ('key' in record && desiredId) record.key = desiredId;
    if (desiredLabel) {
      if ('name' in record) record.name = desiredLabel;
      if ('label' in record) record.label = desiredLabel;
    }
    return record;
  }
  return desired;
};

const pickDialogFields = (values: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in values) picked[key] = values[key];
  });
  return picked;
};

