import type { EnsureProjectPayload, EnsureProjectResult, FormatKind, ProjectState, ProjectStateDetail, ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import type { MetaOptions } from './meta';
import { loadProjectState } from './projectState';
import { PROJECT_FORMAT_REQUIRED_FOR_TOOL, PROJECT_FORMAT_REQUIRED_FOR_TOOL_FIX } from '../shared/messages';
import { errorWithMeta, isResponseError, isUsecaseError, usecaseError } from './guardHelpers';

type EnsureProjectInput = {
  format?: FormatKind;
  name?: string;
  match?: EnsureProjectPayload['match'];
  onMismatch?: EnsureProjectPayload['onMismatch'];
  onMissing?: EnsureProjectPayload['onMissing'];
  confirmDiscard?: boolean;
  confirmDialog?: boolean;
  dialog?: Record<string, unknown>;
};

export const resolveEnsureProjectPayload = (
  input: EnsureProjectInput | boolean | undefined,
  defaults: EnsureProjectInput = {},
  ifRevision?: string
): EnsureProjectPayload | null => {
  if (!input) return null;
  const overrides = input === true ? {} : input;
  const merged = { ...defaults, ...overrides };
  return {
    format: merged.format,
    name: merged.name,
    match: merged.match ?? 'format',
    onMismatch: merged.onMismatch ?? 'reuse',
    onMissing: merged.onMissing ?? 'create',
    confirmDiscard: merged.confirmDiscard,
    confirmDialog: merged.confirmDialog,
    dialog: merged.dialog,
    ifRevision
  };
};

export const runEnsureProject = (
  service: ToolService,
  meta: MetaOptions,
  payload: EnsureProjectPayload | null
): ToolResponse<EnsureProjectResult> | null => {
  if (!payload) return null;
  const ensure = service.ensureProject(payload);
  if (isUsecaseError(ensure)) return usecaseError(ensure, meta, service);
  return { ok: true, data: ensure.value };
};

export const applyRevisionFromProject = (
  meta: MetaOptions,
  project: { revision?: string | null } | null | undefined
): string | undefined => {
  const revision = project?.revision ?? undefined;
  if (!revision) return undefined;
  meta.ifRevision = revision;
  return revision;
};

export const refreshRevisionIf = (
  meta: MetaOptions,
  project: { revision?: string | null } | null | undefined,
  shouldRefresh: boolean
): string | undefined => {
  if (!shouldRefresh) return undefined;
  return applyRevisionFromProject(meta, project);
};

export type EnsureProjectLoadResult = {
  ensure?: EnsureProjectResult;
  project: ProjectState;
  revision?: string;
};

export const ensureProjectAndLoadProject = (args: {
  service: ToolService;
  meta: MetaOptions;
  ensurePayload: EnsureProjectPayload | null;
  detail: ProjectStateDetail;
  includeUsage?: boolean;
  refreshRevision: boolean;
}): ToolResponse<EnsureProjectLoadResult> => {
  const ensureRes = runEnsureProject(args.service, args.meta, args.ensurePayload);
  if (ensureRes && !ensureRes.ok) return ensureRes;
  const projectRes = loadProjectState(args.service, args.meta, args.detail, {
    includeUsage: args.includeUsage
  });
  if (isResponseError(projectRes)) return projectRes;
  const revision = refreshRevisionIf(args.meta, projectRes.data, args.refreshRevision);
  return {
    ok: true,
    data: {
      ...(ensureRes?.ok ? { ensure: ensureRes.data } : {}),
      project: projectRes.data,
      ...(revision ? { revision } : {})
    }
  };
};

export const requireProjectFormat = (
  format: FormatKind | null | undefined,
  expected: FormatKind,
  meta: MetaOptions,
  service: ToolService,
  toolName: string
): ToolResponse<never> | null => {
  if (format === expected) return null;
  return errorWithMeta(
    {
      code: 'invalid_state',
      message: PROJECT_FORMAT_REQUIRED_FOR_TOOL(expected, toolName),
      fix: PROJECT_FORMAT_REQUIRED_FOR_TOOL_FIX(toolName, expected)
    },
    meta,
    service
  );
};
