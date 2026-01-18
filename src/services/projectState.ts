import { FormatKind, ProjectInfo, ProjectState, ProjectStateDetail } from '../types';
import { FormatPort } from '../ports/formats';
import { FormatOverrides, matchesFormatKind } from '../domain/format';
import { SessionState } from '../session';

export class ProjectStateService {
  private readonly formats: FormatPort;
  private readonly overrides?: FormatOverrides;

  constructor(formats: FormatPort, overrides?: FormatOverrides) {
    this.formats = formats;
    this.overrides = overrides;
  }

  normalize(snapshot: SessionState): SessionState {
    const normalized = { ...snapshot };
    if (!normalized.formatId) {
      normalized.formatId = this.formats.getActiveFormatId();
    }
    if (!normalized.format && normalized.formatId) {
      const overrideKind = this.matchOverrideKind(normalized.formatId);
      if (overrideKind) {
        normalized.format = overrideKind;
        return normalized;
      }
      const kinds: FormatKind[] = ['animated_java', 'geckolib', 'vanilla'];
      const match = kinds.find((kind) => matchesFormatKind(kind, normalized.formatId));
      if (match) normalized.format = match;
    }
    return normalized;
  }

  toProjectInfo(snapshot: SessionState): ProjectInfo | null {
    const hasData =
      snapshot.format ||
      snapshot.formatId ||
      snapshot.name ||
      snapshot.bones.length > 0 ||
      snapshot.cubes.length > 0 ||
      snapshot.textures.length > 0 ||
      snapshot.animations.length > 0;
    if (!hasData) return null;
    return {
      id: snapshot.id ?? 'active',
      name: snapshot.name ?? null,
      format: snapshot.format ?? null,
      formatId: snapshot.formatId ?? null
    };
  }

  buildProjectState(
    snapshot: SessionState,
    detail: ProjectStateDetail,
    active: boolean,
    revision: string
  ): ProjectState {
    const counts = {
      bones: snapshot.bones.length,
      cubes: snapshot.cubes.length,
      textures: snapshot.textures.length,
      animations: snapshot.animations.length
    };
    const project: ProjectState = {
      id: active ? snapshot.id ?? 'active' : 'none',
      active,
      name: snapshot.name ?? null,
      format: snapshot.format ?? null,
      formatId: snapshot.formatId ?? null,
      dirty: snapshot.dirty,
      revision,
      counts
    };
    if (detail === 'full') {
      project.bones = snapshot.bones;
      project.cubes = snapshot.cubes;
      project.textures = snapshot.textures;
      project.animations = snapshot.animations;
    }
    return project;
  }

  matchOverrideKind(formatId: string | null): FormatKind | null {
    if (!formatId) return null;
    const overrides = this.overrides;
    if (!overrides) return null;
    const entries = Object.entries(overrides) as Array<[FormatKind, string]>;
    const match = entries.find(([, id]) => id === formatId);
    return match ? match[0] : null;
  }
}
