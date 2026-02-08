import type { Capabilities, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import { checkDimensions, mapDimensionError } from '../../domain/dimensions';
import { withActiveAndRevision } from '../guards';
import { ok, fail, type UsecaseResult } from '../result';
import {
  TEXTURE_RESOLUTION_EXCEEDS_MAX,
  TEXTURE_RESOLUTION_EXCEEDS_MAX_FIX,
  TEXTURE_RESOLUTION_INTEGER,
  TEXTURE_RESOLUTION_POSITIVE
} from '../../shared/messages';

export interface TextureResolutionDeps {
  editor: EditorPort;
  capabilities: Capabilities;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class TextureResolutionService {
  private readonly editor: EditorPort;
  private readonly capabilities: Capabilities;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: TextureResolutionDeps) {
    this.editor = deps.editor;
    this.capabilities = deps.capabilities;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  setProjectTextureResolution(payload: {
    width: number;
    height: number;
    ifRevision?: string;
    modifyUv?: boolean;
  }): UsecaseResult<{ width: number; height: number }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const width = Number(payload.width);
        const height = Number(payload.height);
        const modifyUv = payload.modifyUv === true;
        const maxSize = this.capabilities.limits.maxTextureSize;
        const sizeCheck = checkDimensions(width, height, { requireInteger: true, maxSize });
        if (!sizeCheck.ok) {
          const sizeMessage = mapDimensionError(sizeCheck, {
            nonPositive: (_axis) => TEXTURE_RESOLUTION_POSITIVE,
            nonInteger: (_axis) => TEXTURE_RESOLUTION_INTEGER,
            exceedsMax: (limit) => TEXTURE_RESOLUTION_EXCEEDS_MAX(limit || maxSize)
          });
          if (sizeCheck.reason === 'exceeds_max') {
            return fail({
              code: 'invalid_payload',
              message: sizeMessage ?? TEXTURE_RESOLUTION_EXCEEDS_MAX(maxSize),
              fix: TEXTURE_RESOLUTION_EXCEEDS_MAX_FIX(maxSize),
              details: { width, height, maxSize }
            });
          }
          return fail({ code: 'invalid_payload', message: sizeMessage ?? TEXTURE_RESOLUTION_POSITIVE });
        }
        const err = this.editor.setProjectTextureResolution(width, height, modifyUv);
        if (err) return fail(err);
        return ok({ width, height });
      }
    );
  }
}

