import type { FormatKind, ToolError, ToolResponse } from '../types';
import { err } from '../shared/tooling/toolResponse';
import { PROJECT_NO_ACTIVE } from '../shared/messages';
import type { SessionState } from './types';
import { resolveAnimationTimePolicy } from '../domain/animation/timePolicy';
import { cloneAnimations } from './clone';

const createEmptyState = (policy = resolveAnimationTimePolicy()): SessionState => ({
  id: null,
  format: null,
  formatId: null,
  name: null,
  dirty: undefined,
  bones: [],
  cubes: [],
  textures: [],
  animations: [],
  animationsStatus: 'available',
  animationTimePolicy: { ...policy }
});

export class SessionStateStore {
  private state: SessionState = createEmptyState();

  create(format: FormatKind, name: string, formatId?: string | null): ToolResponse<{ id: string; format: FormatKind; name: string }> {
    const id = `${Date.now()}`;
    const animationTimePolicy = { ...this.state.animationTimePolicy };
    this.state = {
      id,
      format,
      formatId: formatId ?? null,
      name,
      dirty: undefined,
      bones: [],
      cubes: [],
      textures: [],
      animations: [],
      animationsStatus: 'available',
      animationTimePolicy
    };
    return { ok: true, data: { id, format, name } };
  }

  attach(snapshot: SessionState): ToolResponse<{ id: string; format: FormatKind; name: string | null }> {
    if (!snapshot.format) {
      return err<{ id: string; format: FormatKind; name: string | null }>('invalid_state', PROJECT_NO_ACTIVE);
    }
    const id = snapshot.id ?? `${Date.now()}`;
    const format = snapshot.format;
    const name = snapshot.name ?? null;
    const animationTimePolicy = resolveAnimationTimePolicy(snapshot.animationTimePolicy ?? this.state.animationTimePolicy);
    this.state = {
      id,
      format,
      formatId: snapshot.formatId ?? null,
      name,
      dirty: snapshot.dirty,
      bones: [...snapshot.bones],
      cubes: [...snapshot.cubes],
      textures: [...snapshot.textures],
      animations: cloneAnimations(snapshot.animations),
      animationsStatus: snapshot.animationsStatus ?? 'available',
      animationTimePolicy
    };
    return { ok: true, data: { id, format, name } };
  }

  reset(): ToolResponse<{ ok: true }> {
    this.state = createEmptyState(this.state.animationTimePolicy);
    return { ok: true, data: { ok: true } };
  }

  snapshot(): SessionState {
    return {
      ...this.state,
      bones: [...this.state.bones],
      cubes: [...this.state.cubes],
      textures: [...this.state.textures],
      animations: cloneAnimations(this.state.animations),
      animationsStatus: this.state.animationsStatus,
      animationTimePolicy: { ...this.state.animationTimePolicy }
    };
  }

  ensureActive(): ToolError | null {
    if (!this.state.id || !this.state.format) {
      return { code: 'invalid_state', message: PROJECT_NO_ACTIVE, details: { reason: 'no_active_project' } };
    }
    return null;
  }

  getState(): SessionState {
    return this.state;
  }

  setAnimationTimePolicy(policy?: Partial<typeof this.state.animationTimePolicy>) {
    if (!policy) return;
    this.state.animationTimePolicy = resolveAnimationTimePolicy({
      ...this.state.animationTimePolicy,
      ...policy
    });
  }
}
