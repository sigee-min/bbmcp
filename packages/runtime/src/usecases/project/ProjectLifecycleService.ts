import type { Capabilities, EnsureProjectAction, FormatKind, ToolError } from '@ashfox/contracts/types/internal';
import { ok, fail, type UsecaseResult } from '../result';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import {
  PROJECT_CREATE_REQUIREMENTS,
  PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX,
  PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX,
  PROJECT_FORMAT_UNKNOWN,
  PROJECT_MATCH_FORMAT_REQUIRED,
  PROJECT_MATCH_NAME_REQUIRED,
  PROJECT_MISMATCH,
  PROJECT_NO_ACTIVE,
  PROJECT_UV_PIXELS_PER_BLOCK_INVALID,
} from '../../shared/messages';
import { DEFAULT_UV_POLICY } from '../../domain/uv/policy';
import { estimateUvPixelsPerBlock } from '../../domain/uv/density';
import { toDomainSnapshot, toDomainTextureUsage } from '../domainMappers';
import type { ProjectServiceDeps } from './projectServiceTypes';
import { runCreateProject } from './projectCreation';
import { runDeleteProject } from './projectDeletion';

type EnsureMatchMode = 'none' | 'format' | 'name' | 'format_and_name';
type EnsureOnMismatch = 'reuse' | 'error' | 'create';
type EnsureOnMissing = 'create' | 'error';

type EnsureProjectPayload = {
  action?: EnsureProjectAction;
  target?: { name?: string };
  format?: Capabilities['formats'][number]['format'];
  name?: string;
  match?: EnsureMatchMode;
  onMismatch?: EnsureOnMismatch;
  onMissing?: EnsureOnMissing;
  confirmDiscard?: boolean;
  force?: boolean;
  uvPixelsPerBlock?: number;
  dialog?: Record<string, unknown>;
  ifRevision?: string;
};

type EnsureIntent = {
  action: EnsureProjectAction;
  matchMode: EnsureMatchMode;
  onMismatch: EnsureOnMismatch;
  onMissing: EnsureOnMissing;
  requiresFormat: boolean;
  requiresName: boolean;
};

type CreatedProjectResult = {
  id: string;
  format: FormatKind;
  name: string;
};

export class ProjectLifecycleService {
  private readonly session: ProjectServiceDeps['session'];
  private readonly capabilities: ProjectServiceDeps['capabilities'];
  private readonly editor: ProjectServiceDeps['editor'];
  private readonly formats: ProjectServiceDeps['formats'];
  private readonly projectState: ProjectServiceDeps['projectState'];
  private readonly getSnapshot: ProjectServiceDeps['getSnapshot'];
  private readonly ensureRevisionMatch: ProjectServiceDeps['ensureRevisionMatch'];
  private readonly runWithoutRevisionGuard?: ProjectServiceDeps['runWithoutRevisionGuard'];
  private readonly texture?: ProjectServiceDeps['texture'];
  private readonly policies: ProjectServiceDeps['policies'];

  constructor(deps: ProjectServiceDeps) {
    this.session = deps.session;
    this.capabilities = deps.capabilities;
    this.editor = deps.editor;
    this.formats = deps.formats;
    this.projectState = deps.projectState;
    this.getSnapshot = deps.getSnapshot;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.runWithoutRevisionGuard = deps.runWithoutRevisionGuard;
    this.texture = deps.texture;
    this.policies = deps.policies;
  }

  ensureProject(payload: EnsureProjectPayload): UsecaseResult<{
    action: 'created' | 'reused' | 'deleted';
    project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
  }> {
    const intentRes = this.resolveEnsureIntent(payload);
    if (!intentRes.ok) return fail(intentRes.error);
    const intent = intentRes.value;
    if (intent.action === 'delete') {
      return runDeleteProject(this.buildDeleteContext(), payload);
    }
    const payloadErr = this.validateEnsurePayload(payload, intent);
    if (payloadErr) return fail(payloadErr);
    const normalizedUv = this.normalizeUvPixelsPerBlock(payload.uvPixelsPerBlock);
    if (payload.uvPixelsPerBlock !== undefined && normalizedUv === null) {
      return fail({ code: 'invalid_payload', message: PROJECT_UV_PIXELS_PER_BLOCK_INVALID });
    }
    const snapshot = this.getSnapshot();
    const normalized = this.projectState.normalize(snapshot);
    const info = this.projectState.toProjectInfo(normalized);
    const hasActive = Boolean(info && normalized.format);
    if (!hasActive) {
      return this.handleMissingProject(payload, intent.onMissing, normalizedUv);
    }
    if (!normalized.format || !info) {
      return fail({ code: 'invalid_state', message: PROJECT_FORMAT_UNKNOWN });
    }
    const mismatch = this.isProjectMismatch(payload, intent, normalized.format, info.name ?? null);
    if (!mismatch) {
      return this.reuseProject(normalized, normalizedUv);
    }
    if (intent.onMismatch === 'error') {
      return fail({
        code: 'invalid_state',
        message: PROJECT_MISMATCH,
        details: {
          expected: { format: payload.format ?? null, name: payload.name ?? null, match: intent.matchMode },
          actual: { format: normalized.format, name: info.name ?? null }
        }
      });
    }
    if (intent.onMismatch === 'create') {
      return this.createProjectFromEnsure(payload, normalizedUv, PROJECT_CREATE_REQUIREMENTS_ON_MISMATCH_FIX);
    }
    return this.reuseProject(normalized, normalizedUv);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; ifRevision?: string; uvPixelsPerBlock?: number }
  ): UsecaseResult<{ id: string; format: FormatKind; name: string }> {
    const created = runCreateProject(this.buildCreateContext(), format, name, options);
    if (created.ok) {
      const normalizedUv = this.normalizeUvPixelsPerBlock(options?.uvPixelsPerBlock);
      if (options?.uvPixelsPerBlock !== undefined && normalizedUv === null) {
        return fail({ code: 'invalid_payload', message: PROJECT_UV_PIXELS_PER_BLOCK_INVALID });
      }
      const uvErr = this.applyUvPixelsPerBlock(normalizedUv);
      if (uvErr) return fail(uvErr);
      this.maybeCreateProjectTexture(created.value.name);
    }
    return created;
  }

  private resolveEnsureIntent(payload: EnsureProjectPayload): UsecaseResult<EnsureIntent> {
    const action: EnsureProjectAction = payload.action ?? 'ensure';
    const matchMode: EnsureMatchMode = payload.match ?? 'none';
    const onMissing: EnsureOnMissing = payload.onMissing ?? 'create';
    const onMismatch: EnsureOnMismatch = payload.onMismatch ?? 'reuse';
    return ok({
      action,
      matchMode,
      onMismatch,
      onMissing,
      requiresFormat: matchMode === 'format' || matchMode === 'format_and_name',
      requiresName: matchMode === 'name' || matchMode === 'format_and_name'
    });
  }

  private validateEnsurePayload(payload: EnsureProjectPayload, intent: EnsureIntent): ToolError | null {
    const formatBlankErr = ensureNonBlankString(payload.format, 'format');
    if (formatBlankErr) return formatBlankErr;
    const nameBlankErr = ensureNonBlankString(payload.name, 'name');
    if (nameBlankErr) return nameBlankErr;
    if (intent.requiresFormat && !payload.format) {
      return { code: 'invalid_payload', message: PROJECT_MATCH_FORMAT_REQUIRED };
    }
    if (intent.requiresName && !payload.name) {
      return { code: 'invalid_payload', message: PROJECT_MATCH_NAME_REQUIRED };
    }
    return null;
  }

  private handleMissingProject(
    payload: EnsureProjectPayload,
    onMissing: EnsureOnMissing,
    normalizedUv: number | null | undefined
  ): UsecaseResult<{
    action: 'created' | 'reused' | 'deleted';
    project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
  }> {
    if (onMissing === 'error') {
      return fail({ code: 'invalid_state', message: PROJECT_NO_ACTIVE });
    }
    return this.createProjectFromEnsure(payload, normalizedUv, PROJECT_CREATE_REQUIREMENTS_ON_MISSING_FIX);
  }

  private isProjectMismatch(
    payload: EnsureProjectPayload,
    intent: EnsureIntent,
    activeFormat: FormatKind,
    activeName: string | null
  ): boolean {
    const formatMismatch = Boolean(intent.requiresFormat && payload.format && activeFormat !== payload.format);
    const nameMismatch = Boolean(intent.requiresName && payload.name && activeName !== payload.name);
    return formatMismatch || nameMismatch;
  }

  private createProjectFromEnsure(
    payload: EnsureProjectPayload,
    normalizedUv: number | null | undefined,
    fix: string
  ): UsecaseResult<{
    action: 'created' | 'reused' | 'deleted';
    project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
  }> {
    if (!payload.format || !payload.name) {
      return fail({
        code: 'invalid_payload',
        message: PROJECT_CREATE_REQUIREMENTS,
        fix
      });
    }
    const created = runCreateProject(this.buildCreateContext(), payload.format, payload.name, {
      confirmDiscard: payload.confirmDiscard,
      dialog: payload.dialog,
      ifRevision: payload.ifRevision
    });
    if (!created.ok) return created;
    return this.finalizeCreatedProject(created.value, normalizedUv);
  }

  private finalizeCreatedProject(
    created: CreatedProjectResult,
    normalizedUv: number | null | undefined
  ): UsecaseResult<{
    action: 'created' | 'reused' | 'deleted';
    project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
  }> {
    const uvErr = this.applyUvPixelsPerBlock(normalizedUv);
    if (uvErr) return fail(uvErr);
    this.maybeCreateProjectTexture(created.name);
    const sessionState = this.session.snapshot();
    return ok({
      action: 'created',
      project: {
        id: created.id,
        format: created.format,
        name: created.name,
        formatId: sessionState.formatId ?? null
      }
    });
  }

  private reuseProject(
    normalized: ReturnType<ProjectServiceDeps['projectState']['normalize']>,
    normalizedUv: number | null | undefined
  ): UsecaseResult<{
    action: 'created' | 'reused' | 'deleted';
    project: { id: string; format: FormatKind; name: string | null; formatId?: string | null };
  }> {
    const attachRes = this.session.attach(normalized);
    if (!attachRes.ok) return fail(attachRes.error);
    const inferredUv = this.inferUvPixelsPerBlock(normalizedUv);
    const uvErr = this.applyUvPixelsPerBlock(normalizedUv ?? inferredUv);
    if (uvErr) return fail(uvErr);
    return ok({
      action: 'reused',
      project: {
        id: attachRes.data.id,
        format: normalized.format as FormatKind,
        name: attachRes.data.name,
        formatId: normalized.formatId ?? null
      }
    });
  }

  private maybeCreateProjectTexture(name: string | null) {
    if (!this.policies.autoCreateProjectTexture) return;
    if (!this.texture) return;
    const textureName = String(name ?? '').trim() || 'texture';
    const runner = this.runWithoutRevisionGuard ?? ((fn: () => unknown) => fn());
    runner(() => {
      const result = this.texture!.createBlankTexture({
        name: textureName,
        allowExisting: true
      });
      return result;
    });
  }

  private normalizeUvPixelsPerBlock(value?: number): number | null | undefined {
    if (value === undefined) return undefined;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.trunc(numeric);
  }

  private applyUvPixelsPerBlock(value?: number | null): ToolError | null {
    if (value === undefined || value === null) return null;
    const err = this.editor.setProjectUvPixelsPerBlock(value);
    if (err) return err;
    this.session.setUvPixelsPerBlock(value);
    return null;
  }

  private inferUvPixelsPerBlock(explicit?: number | null): number | undefined {
    if (explicit !== undefined && explicit !== null) return undefined;
    if (this.session.snapshot().uvPixelsPerBlock !== undefined) return undefined;
    const usageRes = this.editor.getTextureUsage({});
    if (usageRes.error) return undefined;
    const usageRaw = usageRes.result ?? { textures: [] };
    if (!usageRaw.textures.length) return undefined;
    const usage = toDomainTextureUsage(usageRaw);
    const snapshot = toDomainSnapshot(this.getSnapshot());
    const policy = this.policies.uvPolicy ?? DEFAULT_UV_POLICY;
    const inferred = estimateUvPixelsPerBlock(usage, snapshot.cubes, policy);
    return inferred ?? undefined;
  }

  private buildCreateContext() {
    return {
      capabilities: this.capabilities,
      editor: this.editor,
      formats: this.formats,
      session: this.session,
      ensureRevisionMatch: this.ensureRevisionMatch,
      policies: this.policies
    };
  }

  private buildDeleteContext() {
    return {
      session: this.session,
      editor: this.editor,
      projectState: this.projectState,
      getSnapshot: this.getSnapshot,
      ensureRevisionMatch: this.ensureRevisionMatch
    };
  }
}

