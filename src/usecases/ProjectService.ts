import type { Capabilities, FormatKind, ProjectDiff, ProjectState, ProjectStateDetail, ToolError } from '../types';
import type { EditorPort } from '../ports/editor';
import type { FormatPort } from '../ports/formats';
import { ProjectSession } from '../session';
import { ProjectStateService } from '../services/projectState';
import { ok, fail, UsecaseResult } from './result';
import { resolveFormatId, FormatOverrides } from '../services/format';
import { diffSnapshots } from '../services/diff';
import { withFormatOverrideHint } from './formatHints';

export interface ProjectServiceDeps {
  session: ProjectSession;
  capabilities: Capabilities;
  editor: EditorPort;
  formats: FormatPort;
  projectState: ProjectStateService;
  revision: {
    track: (snapshot: ReturnType<ProjectSession['snapshot']>) => string;
    hash: (snapshot: ReturnType<ProjectSession['snapshot']>) => string;
    get: (id: string) => ReturnType<ProjectSession['snapshot']> | null;
    remember: (snapshot: ReturnType<ProjectSession['snapshot']>, id: string) => void;
  };
  getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  policies: {
    formatOverrides?: FormatOverrides;
    autoDiscardUnsaved?: boolean;
  };
}

export class ProjectService {
  private readonly session: ProjectSession;
  private readonly capabilities: Capabilities;
  private readonly editor: EditorPort;
  private readonly formats: FormatPort;
  private readonly projectState: ProjectStateService;
  private readonly revision: ProjectServiceDeps['revision'];
  private readonly getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  private readonly policies: ProjectServiceDeps['policies'];

  constructor(deps: ProjectServiceDeps) {
    this.session = deps.session;
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.formats = deps.formats;
    this.projectState = deps.projectState;
    this.revision = deps.revision;
    this.getSnapshot = deps.getSnapshot;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.policies = deps.policies;
  }

  getProjectState(payload: { detail?: ProjectStateDetail }): UsecaseResult<{ project: ProjectState }> {
    const detail: ProjectStateDetail = payload.detail ?? 'summary';
    const snapshot = this.getSnapshot();
    const info = this.projectState.toProjectInfo(snapshot);
    const active = Boolean(info);
    const revision = this.revision.track(snapshot);
    const project = this.projectState.buildProjectState(snapshot, detail, active, revision);
    const resolution = this.editor.getProjectTextureResolution();
    if (resolution) {
      project.textureResolution = resolution;
    }
    if (detail === 'full') {
      const usage = this.editor.getTextureUsage({});
      if (!usage.error && usage.result) {
        project.textureUsage = usage.result;
      }
    }
    return ok({ project });
  }

  getProjectDiff(payload: { sinceRevision: string; detail?: ProjectStateDetail }): UsecaseResult<{ diff: ProjectDiff }> {
    const detail: ProjectStateDetail = payload.detail ?? 'summary';
    const snapshot = this.getSnapshot();
    const info = this.projectState.toProjectInfo(snapshot);
    if (!info) {
      return fail({ code: 'invalid_state', message: 'No active project.' });
    }
    const currentRevision = this.revision.hash(snapshot);
    const previous = this.revision.get(payload.sinceRevision);
    const baseMissing = !previous;
    const emptyBase = {
      ...snapshot,
      bones: [],
      cubes: [],
      textures: [],
      animations: [],
      animationsStatus: snapshot.animationsStatus
    };
    const diffResult = diffSnapshots(previous ?? emptyBase, snapshot, detail === 'full');
    const diff: ProjectDiff = {
      sinceRevision: payload.sinceRevision,
      currentRevision,
      baseMissing: baseMissing || undefined,
      counts: diffResult.counts
    };
    if (detail === 'full' && diffResult.sets) {
      diff.bones = diffResult.sets.bones;
      diff.cubes = diffResult.sets.cubes;
      diff.textures = diffResult.sets.textures;
      diff.animations = diffResult.sets.animations;
    }
    this.revision.remember(snapshot, currentRevision);
    return ok({ diff });
  }

  ensureProject(payload: {
    format?: Capabilities['formats'][number]['format'];
    name?: string;
    match?: 'none' | 'format' | 'name' | 'format_and_name';
    onMismatch?: 'reuse' | 'error' | 'create';
    onMissing?: 'create' | 'error';
    confirmDiscard?: boolean;
    dialog?: Record<string, unknown>;
    confirmDialog?: boolean;
    ifRevision?: string;
  }): UsecaseResult<{ action: 'created' | 'reused'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> {
    const matchMode = payload.match ?? 'none';
    const onMissing = payload.onMissing ?? 'create';
    const onMismatch = payload.onMismatch ?? 'reuse';
    const requiresFormat = matchMode === 'format' || matchMode === 'format_and_name';
    const requiresName = matchMode === 'name' || matchMode === 'format_and_name';
    if (requiresFormat && !payload.format) {
      return fail({
        code: 'invalid_payload',
        message: 'format is required when match includes format.'
      });
    }
    if (requiresName && !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: 'name is required when match includes name.'
      });
    }

    const snapshot = this.getSnapshot();
    const normalized = this.projectState.normalize(snapshot);
    const info = this.projectState.toProjectInfo(normalized);
    const hasActive = Boolean(info && normalized.format);

    if (!hasActive) {
      if (onMissing === 'error') {
        return fail({ code: 'invalid_state', message: 'No active project.' });
      }
      if (!payload.format || !payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'format and name are required to create a new project.',
          fix: 'Provide format and name or set onMissing=error.'
        });
      }
      const created = this.createProject(payload.format, payload.name, {
        confirmDiscard: payload.confirmDiscard,
        dialog: payload.dialog,
        confirmDialog: payload.confirmDialog,
        ifRevision: payload.ifRevision
      });
      if (!created.ok) return created;
      const sessionState = this.session.snapshot();
      return ok({
        action: 'created',
        project: {
          id: created.value.id,
          format: created.value.format,
          name: created.value.name,
          formatId: sessionState.formatId ?? null
        }
      });
    }

    if (!normalized.format || !info) {
      return fail({ code: 'invalid_state', message: 'Active project format is unknown.' });
    }

    const formatMismatch = requiresFormat && payload.format && normalized.format !== payload.format;
    const nameMismatch = requiresName && payload.name && info.name !== payload.name;
    const mismatch = formatMismatch || nameMismatch;

    if (mismatch && onMismatch === 'error') {
      return fail({
        code: 'invalid_state',
        message: 'Active project does not match requested criteria.',
        details: {
          expected: { format: payload.format ?? null, name: payload.name ?? null, match: matchMode },
          actual: { format: normalized.format, name: info.name ?? null }
        }
      });
    }

    if (mismatch && onMismatch === 'create') {
      if (!payload.format || !payload.name) {
        return fail({
          code: 'invalid_payload',
          message: 'format and name are required to create a new project.',
          fix: 'Provide format and name or set onMismatch=reuse/error.'
        });
      }
      const created = this.createProject(payload.format, payload.name, {
        confirmDiscard: payload.confirmDiscard,
        dialog: payload.dialog,
        confirmDialog: payload.confirmDialog,
        ifRevision: payload.ifRevision
      });
      if (!created.ok) return created;
      const sessionState = this.session.snapshot();
      return ok({
        action: 'created',
        project: {
          id: created.value.id,
          format: created.value.format,
          name: created.value.name,
          formatId: sessionState.formatId ?? null
        }
      });
    }

    const attachRes = this.session.attach(normalized);
    if (!attachRes.ok) return fail(attachRes.error);
    return ok({
      action: 'reused',
      project: {
        id: attachRes.data.id,
        format: normalized.format,
        name: attachRes.data.name,
        formatId: normalized.formatId ?? null
      }
    });
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; confirmDialog?: boolean; ifRevision?: string }
  ): UsecaseResult<{ id: string; format: FormatKind; name: string }> {
    const revisionErr = this.ensureRevisionMatch(options?.ifRevision);
    if (revisionErr) {
      return fail(revisionErr);
    }
    const capability = this.capabilities.formats.find((f) => f.format === format);
    if (!capability || !capability.enabled) {
      return fail({
        code: 'unsupported_format',
        message: `Unsupported format: ${format}`,
        fix: 'Use list_capabilities to pick an enabled format.'
      });
    }
    if (!name) {
      return fail({
        code: 'invalid_payload',
        message: 'Project name is required',
        fix: 'Provide a non-empty project name.'
      });
    }
    const formatId = resolveFormatId(format, this.formats.listFormats(), this.policies.formatOverrides);
    if (!formatId) {
      return fail({
        code: 'unsupported_format',
        message: withFormatOverrideHint(`No matching format ID for ${format}`),
        fix: 'Set a format ID override in settings or choose another format.'
      });
    }
    const { ifRevision: _ifRevision, ...editorOptions } = options ?? {};
    const effectiveConfirmDiscard = editorOptions.confirmDiscard ?? this.policies.autoDiscardUnsaved;
    const nextOptions =
      effectiveConfirmDiscard === undefined
        ? editorOptions
        : { ...editorOptions, confirmDiscard: effectiveConfirmDiscard };
    const err = this.editor.createProject(name, formatId, format, nextOptions);
    if (err) return fail(err);
    const result = this.session.create(format, name, formatId);
    if (!result.ok) {
      return fail(result.error);
    }
    return ok(result.data);
  }

  matchOverrideKind(formatId: string): FormatKind | null {
    return this.projectState.matchOverrideKind(formatId);
  }
}
