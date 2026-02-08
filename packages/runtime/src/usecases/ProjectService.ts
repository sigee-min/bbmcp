import type { Capabilities, FormatKind } from '@ashfox/contracts/types/internal';
import { type UsecaseResult } from './result';
import { ProjectLifecycleService } from './project/ProjectLifecycleService';
import { ProjectStateService } from './project/ProjectStateService';
import type { ProjectServiceDeps } from './project/projectServiceTypes';
import type {
  CreateProjectOptions,
  CreateProjectResult,
  EnsureProjectPayload,
  EnsureProjectResult,
  GetProjectDiffPayload,
  GetProjectDiffResult,
  GetProjectStatePayload,
  GetProjectStateResult
} from './project/projectServiceContracts';

export class ProjectService {
  private readonly projectState: ProjectServiceDeps['projectState'];
  private readonly lifecycle: ProjectLifecycleService;
  private readonly state: ProjectStateService;

  constructor(deps: ProjectServiceDeps) {
    this.projectState = deps.projectState;
    this.lifecycle = new ProjectLifecycleService(deps);
    this.state = new ProjectStateService(deps);
  }

  getProjectState(payload: GetProjectStatePayload): UsecaseResult<GetProjectStateResult> {
    return this.state.getProjectState(payload);
  }

  getProjectDiff(payload: GetProjectDiffPayload): UsecaseResult<GetProjectDiffResult> {
    return this.state.getProjectDiff(payload);
  }

  ensureProject(payload: EnsureProjectPayload): UsecaseResult<EnsureProjectResult> {
    return this.lifecycle.ensureProject(payload);
  }

  createProject(
    format: Capabilities['formats'][number]['format'],
    name: string,
    options?: CreateProjectOptions
  ): UsecaseResult<CreateProjectResult> {
    return this.lifecycle.createProject(format, name, options);
  }

  matchOverrideKind(formatId: string): FormatKind | null {
    return this.projectState.matchOverrideKind(formatId);
  }
}






