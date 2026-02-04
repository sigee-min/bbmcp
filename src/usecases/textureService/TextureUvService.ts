import type { ToolError } from '../../types';
import type { SessionState } from '../../session';
import type { CubeFaceDirection, EditorPort, FaceUvMap } from '../../ports/editor';
import { withActiveAndRevision } from '../guards';
import { ok, fail, type UsecaseResult } from '../result';
import { validateUvBounds } from '../../domain/uv/bounds';
import { validateUvAssignments } from '../../domain/uv/assignments';
import { formatRectExample, type UvRectIssueExample } from '../../domain/uv/issues';
import {
  MODEL_CUBE_NOT_FOUND,
  TEXTURE_FACE_UV_BOUNDS_FIX,
  TEXTURE_FACE_UV_FACES_FIX,
  TEXTURE_FACE_UV_TARGET_FIX,
  TEXTURE_FACE_UV_SMALL_RECTS,
  TEXTURE_FACE_UV_SKEWED_RECTS
} from '../../shared/messages';
import { buildUvAssignmentMessages, buildUvBoundsMessages } from '../../shared/messages';

const uvAssignmentMessages = buildUvAssignmentMessages();
const uvBoundsMessages = buildUvBoundsMessages();

export interface TextureUvDeps {
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  getUvPolicyConfig?: () => import('../../domain/uv/policy').UvPolicyConfig;
}

export class TextureUvService {
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  private readonly getUvPolicyConfig?: () => import('../../domain/uv/policy').UvPolicyConfig;

  constructor(deps: TextureUvDeps) {
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.getUvPolicyConfig = deps.getUvPolicyConfig;
  }

  setFaceUv(payload: {
    cubeId?: string;
    cubeName?: string;
    faces: FaceUvMap;
    ifRevision?: string;
  }): UsecaseResult<{
    cubeId?: string;
    cubeName: string;
    faces: CubeFaceDirection[];
    warnings?: string[];
    warningCodes?: string[];
  }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const assignmentRes = validateUvAssignments(
          [{ cubeId: payload.cubeId, cubeName: payload.cubeName, faces: payload.faces }],
          uvAssignmentMessages
        );
        if (!assignmentRes.ok) {
          const reason = assignmentRes.error.details?.reason;
          if (reason === 'target_required' || reason === 'cube_ids_string_array' || reason === 'cube_names_string_array') {
            return fail({
              ...assignmentRes.error,
              fix: TEXTURE_FACE_UV_TARGET_FIX
            });
          }
          if (reason === 'faces_required' || reason === 'faces_non_empty') {
            return fail({
              ...assignmentRes.error,
              fix: TEXTURE_FACE_UV_FACES_FIX
            });
          }
          return fail(assignmentRes.error);
        }
        const snapshot = this.getSnapshot();
        const target = snapshot.cubes.find((cube) => cube.id === payload.cubeId || cube.name === payload.cubeName);
        if (!target) {
          return fail({
            code: 'invalid_payload',
            message: MODEL_CUBE_NOT_FOUND(payload.cubeId ?? payload.cubeName ?? 'unknown')
          });
        }
        const faces: CubeFaceDirection[] = [];
        const normalized: FaceUvMap = {};
        const faceEntries = Object.entries(payload.faces ?? {});
        for (const [faceKey, uv] of faceEntries) {
          const [x1, y1, x2, y2] = uv as [number, number, number, number];
          const boundsErr = this.ensureFaceUvWithinResolution([x1, y1, x2, y2]);
          if (boundsErr) return fail(boundsErr);
          normalized[faceKey as CubeFaceDirection] = [x1, y1, x2, y2];
          faces.push(faceKey as CubeFaceDirection);
        }
        const rectWarnings = this.buildUvRectWarnings(target.name, normalized);
        const err = this.editor.setFaceUv({
          cubeId: target.id ?? payload.cubeId,
          cubeName: target.name,
          faces: normalized
        });
        if (err) return fail(err);
        return ok({
          cubeId: target.id ?? payload.cubeId,
          cubeName: target.name,
          faces,
          ...(rectWarnings.warnings.length > 0 ? { warnings: rectWarnings.warnings } : {}),
          ...(rectWarnings.warningCodes.length > 0 ? { warningCodes: rectWarnings.warningCodes } : {})
        });
      }
    );
  }

  private ensureFaceUvWithinResolution(uv: [number, number, number, number]): ToolError | null {
    const resolution = this.editor.getProjectTextureResolution();
    if (!resolution) return null;
    const boundsErr = validateUvBounds(uv, resolution, { uv, textureResolution: resolution }, uvBoundsMessages);
    if (!boundsErr) return null;
    if (boundsErr.ok) return null;
    const reason = boundsErr.error.details?.reason;
    if (reason === 'out_of_bounds') {
      return {
        ...boundsErr.error,
        fix: TEXTURE_FACE_UV_BOUNDS_FIX
      };
    }
    return boundsErr.error;
  }

  private buildUvRectWarnings(
    cubeName: string,
    faces: FaceUvMap
  ): { warnings: string[]; warningCodes: string[] } {
    const { minArea, maxAspect } = this.getUvWarningConfig();
    let smallCount = 0;
    let skewedCount = 0;
    let smallExample: UvRectIssueExample | undefined;
    let skewedExample: UvRectIssueExample | undefined;
    for (const [faceKey, uv] of Object.entries(faces)) {
      const [x1, y1, x2, y2] = uv as [number, number, number, number];
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
      const area = width * height;
      const aspectRatio = width >= height ? width / height : height / width;
      const example: UvRectIssueExample = {
        cubeName,
        face: faceKey as CubeFaceDirection,
        width,
        height,
        area,
        aspectRatio
      };
      if (area <= minArea) {
        smallCount += 1;
        if (!smallExample) smallExample = example;
      }
      if (aspectRatio >= maxAspect) {
        skewedCount += 1;
        if (!skewedExample) skewedExample = example;
      }
    }
    const warnings: string[] = [];
    const warningCodes: string[] = [];
    if (smallCount > 0) {
      warnings.push(
        TEXTURE_FACE_UV_SMALL_RECTS(
          cubeName,
          smallCount,
          minArea,
          formatRectExample(smallExample)
        )
      );
      warningCodes.push('uv_rect_small');
    }
    if (skewedCount > 0) {
      warnings.push(
        TEXTURE_FACE_UV_SKEWED_RECTS(
          cubeName,
          skewedCount,
          maxAspect,
          formatRectExample(skewedExample)
        )
      );
      warningCodes.push('uv_rect_skewed');
    }
    return { warnings, warningCodes };
  }

  private getUvWarningConfig(): { minArea: number; maxAspect: number } {
    const policy = this.getUvPolicyConfig?.();
    const resolution = this.editor.getProjectTextureResolution();
    const tinyThreshold = Number.isFinite(policy?.tinyThreshold) ? (policy?.tinyThreshold as number) : 2;
    const baseArea = Math.max(4, Math.round(tinyThreshold * tinyThreshold));
    const scaledArea = resolution
      ? Math.round((resolution.width * resolution.height) / 512)
      : 0;
    const minArea = clamp(Math.max(baseArea, scaledArea), baseArea, 64);
    const maxSide = resolution ? Math.max(resolution.width, resolution.height) : 0;
    const maxAspect = maxSide >= 128 ? 5 : maxSide >= 64 ? 4 : 3;
    return { minArea, maxAspect };
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

