import type { Capabilities, ToolError } from '../types';
import type { EditorPort } from '../ports/editor';
import type { ProjectSession } from '../session';
import { ok, fail, UsecaseResult } from './result';
import { validateSnapshot } from '../domain/validation';
import { toDomainSnapshot, toDomainTextureResolution, toDomainTextureStats, toDomainTextureUsage } from './domainMappers';
import type { UvPolicyConfig } from '../domain/uvPolicy';

export interface ValidationServiceDeps {
  editor: EditorPort;
  capabilities: Capabilities;
  ensureActive: () => ToolError | null;
  getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  getUvPolicyConfig: () => UvPolicyConfig;
}

export class ValidationService {
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly ensureActive: () => ToolError | null;
  private readonly getSnapshot: () => ReturnType<ProjectSession['snapshot']>;
  private readonly getUvPolicyConfig: () => UvPolicyConfig;

  constructor(deps: ValidationServiceDeps) {
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.ensureActive = deps.ensureActive;
    this.getSnapshot = deps.getSnapshot;
    this.getUvPolicyConfig = deps.getUvPolicyConfig;
  }

  validate(): UsecaseResult<{ findings: { code: string; message: string; severity: 'error' | 'warning' | 'info' }[] }> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const snapshot = toDomainSnapshot(this.getSnapshot());
    const textures = toDomainTextureStats(this.editor.listTextures());
    const textureResolution = toDomainTextureResolution(this.editor.getProjectTextureResolution());
    const usage = this.editor.getTextureUsage({});
    const usageDomain = usage.error ? undefined : toDomainTextureUsage(usage.result ?? { textures: [] });
    const findings = validateSnapshot(snapshot, {
      limits: this.capabilities.limits,
      textures,
      textureResolution,
      textureUsage: usageDomain,
      uvPolicy: this.getUvPolicyConfig()
    });
    return ok({ findings });
  }
}
