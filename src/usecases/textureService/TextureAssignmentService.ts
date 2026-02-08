import type { ToolError } from '@ashfox/contracts/types/internal';
import type { SessionState } from '../../session';
import type { EditorPort } from '../../ports/editor';
import type { CubeFaceDirection } from '../../ports/editor';
import { resolveTextureTarget } from '../targetResolvers';
import { withActiveAndRevision } from '../guards';
import { ok, fail, type UsecaseResult } from '../result';
import { normalizeCubeFaces, resolveCubeTargets } from './textureUsageUtils';
import {
  TEXTURE_ASSIGN_FACES_INVALID,
  TEXTURE_ASSIGN_NO_TARGETS,
  TEXTURE_ASSIGN_TARGET_REQUIRED,
  TEXTURE_ASSIGN_TARGET_REQUIRED_FIX
} from '../../shared/messages';

export interface TextureAssignmentDeps {
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class TextureAssignmentService {
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: TextureAssignmentDeps) {
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  assignTexture(payload: {
    textureId?: string;
    textureName?: string;
    cubeIds?: string[];
    cubeNames?: string[];
    faces?: CubeFaceDirection[];
    ifRevision?: string;
  }): UsecaseResult<{ textureId?: string; textureName: string; cubeCount: number; faces?: CubeFaceDirection[] }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const resolved = resolveTextureTarget(snapshot.textures, payload.textureId, payload.textureName, {
          idLabel: 'textureId',
          nameLabel: 'textureName',
          required: { message: TEXTURE_ASSIGN_TARGET_REQUIRED, fix: TEXTURE_ASSIGN_TARGET_REQUIRED_FIX }
        });
        if (resolved.error) return fail(resolved.error);
        const texture = resolved.target!;
        const cubes = resolveCubeTargets(snapshot.cubes, payload.cubeIds, payload.cubeNames);
        if (cubes.length === 0) {
          return fail({ code: 'invalid_payload', message: TEXTURE_ASSIGN_NO_TARGETS });
        }
        const faces = normalizeCubeFaces(payload.faces);
        if (payload.faces && payload.faces.length > 0 && !faces) {
          return fail({
            code: 'invalid_payload',
            message: TEXTURE_ASSIGN_FACES_INVALID
          });
        }
        const cubeIds = Array.from(new Set(cubes.map((cube) => cube.id).filter(Boolean) as string[]));
        const cubeNames = Array.from(new Set(cubes.map((cube) => cube.name)));
        const err = this.editor.assignTexture({
          textureId: texture.id ?? payload.textureId,
          textureName: texture.name,
          cubeIds,
          cubeNames,
          faces: faces ?? undefined
        });
        if (err) return fail(err);
        return ok({
          textureId: texture.id ?? payload.textureId,
          textureName: texture.name,
          cubeCount: cubes.length,
          faces: faces ?? undefined
        });
      }
    );
  }
}

