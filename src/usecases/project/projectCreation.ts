import type { Capabilities, FormatKind } from '@ashfox/contracts/types/internal';
import { resolveFormatId } from '../../domain/formats';
import { withFormatOverrideHint } from '../formatHints';
import { buildProjectDialogDefaults } from '../../domain/project/projectDialogDefaults';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import {
  ADAPTER_PROJECT_UNSAVED_CHANGES,
  PROJECT_FORMAT_ID_MISSING,
  PROJECT_FORMAT_ID_MISSING_FIX,
  PROJECT_FORMAT_UNSUPPORTED_FIX,
  PROJECT_NAME_REQUIRED_FIX,
  PROJECT_UNSUPPORTED_FORMAT
} from '../../shared/messages';
import type { ProjectServiceDeps } from './projectServiceTypes';
import { ok, fail, type UsecaseResult } from '../result';

export type ProjectCreateContext = Pick<
  ProjectServiceDeps,
  'capabilities' | 'editor' | 'formats' | 'session' | 'ensureRevisionMatch' | 'policies'
>;

export const runCreateProject = (
  ctx: ProjectCreateContext,
  format: Capabilities['formats'][number]['format'],
  name: string,
  options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; ifRevision?: string }
): UsecaseResult<{ id: string; format: FormatKind; name: string }> => {
  const revisionErr = ctx.ensureRevisionMatch(options?.ifRevision);
  if (revisionErr) {
    return fail(revisionErr);
  }
  const nameBlankErr = ensureNonBlankString(name, 'Project name');
  if (nameBlankErr) {
    return fail({
      ...nameBlankErr,
      fix: PROJECT_NAME_REQUIRED_FIX
    });
  }
  const capability = ctx.capabilities.formats.find((f) => f.format === format);
  if (!capability || !capability.enabled) {
    return fail({
      code: 'unsupported_format',
      message: PROJECT_UNSUPPORTED_FORMAT(format),
      fix: PROJECT_FORMAT_UNSUPPORTED_FIX
    });
  }
  const formatId = resolveFormatId(format, ctx.formats.listFormats(), ctx.policies.formatOverrides);
  if (!formatId) {
    return fail({
      code: 'unsupported_format',
      message: withFormatOverrideHint(PROJECT_FORMAT_ID_MISSING(format)),
      fix: PROJECT_FORMAT_ID_MISSING_FIX
    });
  }
  const explicitConfirmDiscard = options?.confirmDiscard;
  const dialogDefaults = buildProjectDialogDefaults({ format, formatId, name });
  const { ifRevision: _ifRevision, dialog: dialogOverrides, ...editorOptions } = options ?? {};
  const mergedDialog = mergeDialogValues(dialogDefaults, dialogOverrides);
  const effectiveConfirmDiscard = editorOptions.confirmDiscard ?? ctx.policies.autoDiscardUnsaved;
  const nextOptions =
    effectiveConfirmDiscard === undefined
      ? editorOptions
      : { ...editorOptions, confirmDiscard: effectiveConfirmDiscard };
  const editorPayload = mergedDialog ? { ...nextOptions, dialog: mergedDialog } : nextOptions;
  const err = ctx.editor.createProject(name, formatId, format, editorPayload);
  if (err) {
    if (shouldRetryDiscardUnsaved(err, explicitConfirmDiscard, ctx.policies.autoDiscardUnsaved)) {
      const retryOptions = { ...editorPayload, confirmDiscard: true };
      const retryErr = ctx.editor.createProject(name, formatId, format, retryOptions);
      if (retryErr) return fail(retryErr);
    } else {
      return fail(err);
    }
  }
  const result = ctx.session.create(format, name, formatId);
  if (!result.ok) {
    return fail(result.error);
  }
  return ok(result.data);
};

const mergeDialogValues = (
  defaults: Record<string, unknown>,
  overrides?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const merged: Record<string, unknown> = {};
  let hasEntries = false;
  const assign = (source?: Record<string, unknown>) => {
    if (!source) return;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      merged[key] = value;
      hasEntries = true;
    }
  };
  assign(defaults);
  assign(overrides);
  return hasEntries ? merged : undefined;
};

const shouldRetryDiscardUnsaved = (
  error: { code: string; message: string },
  explicitConfirmDiscard: boolean | undefined,
  autoDiscardUnsaved: boolean | undefined
): boolean => {
  if (!autoDiscardUnsaved) return false;
  if (explicitConfirmDiscard !== false) return false;
  return error.code === 'invalid_state' && error.message === ADAPTER_PROJECT_UNSAVED_CHANGES;
};

