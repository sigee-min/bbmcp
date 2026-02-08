import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import type { SetFaceUvCommand } from '../../../ports/editor';
import { withToolErrorAdapterError } from '../adapterErrors';
import { getCubeApi } from '../blockbenchAdapterUtils';
import { findCubeRef } from '../outlinerLookup';
import { withUndo, extendEntity } from '../blockbenchUtils';
import { MODEL_CUBE_NOT_FOUND, UV_ASSIGNMENT_FACES_NON_EMPTY } from '../../../shared/messages';
import { ensureFaceEntry, ensureFaceMap, enforceManualUvMode, VALID_FACE_KEYS } from './uvUtils';
import type { CubeFaceDirection } from '../../../types/blockbench';

export class BlockbenchUvAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  setFaceUv(params: SetFaceUvCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'face UV update', 'face UV update failed', () => {
      const api = getCubeApi();
      if ('error' in api) return api.error;
      const target = findCubeRef(params.cubeName, params.cubeId);
      if (!target) {
        const label = params.cubeId ?? params.cubeName ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      const faceEntries = Object.entries(params.faces ?? {});
      if (faceEntries.length === 0) {
        return { code: 'invalid_payload', message: UV_ASSIGNMENT_FACES_NON_EMPTY };
      }
      const faceMap = ensureFaceMap(target);
      withUndo({ elements: true }, 'Set face UV', () => {
        enforceManualUvMode(target, { preserve: true });
        faceEntries.forEach(([faceKey, uv]) => {
          if (!VALID_FACE_KEYS.has(faceKey as CubeFaceDirection) || !uv) return;
          const face = ensureFaceEntry(faceMap, faceKey as CubeFaceDirection);
          if (!extendEntity(face, { uv: uv as [number, number, number, number] })) {
            face.uv = uv as [number, number, number, number];
          }
        });
      });
      this.log.info('face UV updated', { cube: target?.name ?? params.cubeName, faces: faceEntries.length });
      return null;
    });
  }
}

