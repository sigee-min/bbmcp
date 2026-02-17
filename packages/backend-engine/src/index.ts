import {
  type ToolName,
  type ToolPayloadMap,
  type ToolResponse,
  type ToolResultMap
} from '@ashfox/contracts/types/internal';
import {
  backendToolError,
  type BackendHealth,
  type BackendPort,
  type BackendToolContext,
  type PersistenceHealth,
  type PersistencePorts
} from '@ashfox/backend-core';
import { RevisionStore } from '../../runtime/src/domain/revision/revisionStore';
import { executeEngineTool } from './internal/toolExecution';

export interface EngineBackendOptions {
  version?: string;
  details?: Record<string, unknown>;
  persistence?: PersistencePorts;
}

export class EngineBackend implements BackendPort {
  readonly kind = 'engine' as const;
  private readonly version: string;
  private readonly details?: Record<string, unknown>;
  private readonly persistence?: PersistencePorts;
  private readonly revisionStore = new RevisionStore(1);

  constructor(options: EngineBackendOptions = {}) {
    this.version = options.version ?? '0.0.0-dev';
    this.details = options.details;
    this.persistence = options.persistence;
  }

  async getHealth(): Promise<BackendHealth> {
    const persistence: PersistenceHealth | undefined = this.persistence?.health;
    if (!persistence) {
      return {
        kind: this.kind,
        availability: 'offline',
        version: this.version,
        details: {
          reason: 'persistence_missing',
          ...this.details
        }
      };
    }
    const availability: BackendHealth['availability'] =
      !persistence.database.ready
        ? 'offline'
        : persistence.storage.ready
          ? 'ready'
          : 'degraded';
    return {
      kind: this.kind,
      availability,
      version: this.version,
      details: {
        persistence,
        ...this.details
      }
    };
  }

  async handleTool<TName extends ToolName>(
    name: TName,
    payload: ToolPayloadMap[TName],
    context: BackendToolContext
  ): Promise<ToolResponse<ToolResultMap[TName]>> {
    if (!this.persistence) {
      return backendToolError(
        'invalid_state',
        'Engine backend requires persistence ports.',
        'Configure gateway persistence and retry.',
        { backend: this.kind }
      ) as ToolResponse<ToolResultMap[TName]>;
    }

    return executeEngineTool({
      name,
      payload,
      context,
      backendKind: this.kind,
      persistence: this.persistence,
      revisionHash: (state) => this.revisionStore.hash(state)
    });
  }
}

export const createEngineBackend = (options?: EngineBackendOptions): BackendPort => new EngineBackend(options);
