import type { Capabilities, EnsureProjectAction, FormatKind, ProjectDiff, ProjectState, ProjectStateDetail } from '../types';
import { type UsecaseResult } from './result';
import { ProjectLifecycleService } from './project/ProjectLifecycleService';
import { ProjectStateService } from './project/ProjectStateService';
import type { ProjectServiceDeps } from './project/projectServiceTypes';

export class ProjectService {
  private readonly projectState: ProjectServiceDeps['projectState'];
  private readonly lifecycle: ProjectLifecycleService;
  private readonly state: ProjectStateService;

  constructor(deps: ProjectServiceDeps) {
    this.projectState = deps.projectState;
    this.lifecycle = new ProjectLifecycleService(deps);
    this.state = new ProjectStateService(deps);
  }

  getProjectState(payload: { detail?: ProjectStateDetail; includeUsage?: boolean }): UsecaseResult<{ project: ProjectState }> {
    return this.state.getProjectState(payload);
  }

  getProjectDiff(payload: { sinceRevision: string; detail?: ProjectStateDetail }): UsecaseResult<{ diff: ProjectDiff }> {
    return this.state.getProjectDiff(payload);
  }

  ensureProject(payload: {
    action?: EnsureProjectAction;
    target?: { name?: string };
    format?: Capabilities['formats'][number]['format'];
    name?: string;
    match?: 'none' | 'format' | 'name' | 'format_and_name';
    onMismatch?: 'reuse' | 'error' | 'create';
    onMissing?: 'create' | 'error';
    confirmDiscard?: boolean;
    force?: boolean;
    dialog?: Record<string, unknown>;
    ifRevision?: string;
  }): UsecaseResult<{ action: 'created' | 'reused' | 'deleted'; project: { id: string; format: FormatKind; name: string | null; formatId?: string | null } }> {
    return this.lifecycle.ensureProject(payload);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: { confirmDiscard?: boolean; dialog?: Record<string, unknown>; ifRevision?: string }
  ): UsecaseResult<{ id: string; format: FormatKind; name: string }> {
    return this.lifecycle.createProject(format, name, options);
  }

  matchOverrideKind(formatId: string): FormatKind | null {
    return this.projectState.matchOverrideKind(formatId);
  }
}





