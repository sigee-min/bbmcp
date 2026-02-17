import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import type { AssignTextureCommand } from '../../../ports/editor';
import { withToolErrorAdapterError } from '../adapterErrors';
import { getCubeApi, getTextureApi } from '../blockbenchAdapterUtils';
import { resolveTargetCubes, findTextureRef } from '../outlinerLookup';
import { withUndo, extendEntity } from '../blockbenchUtils';
import {
  ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE,
  ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE,
  TEXTURE_ASSIGN_NO_TARGETS,
  TEXTURE_NOT_FOUND
} from '../../../shared/messages';
import type { CubeFaceDirection } from '../../../types/blockbench';
import { ALL_FACES, ensureFaceEntry, ensureFaceMap, enforceManualUvMode, normalizeFaces, resolveFaceTextureRef } from './uvUtils';

export class BlockbenchTextureAssignAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  assignTexture(params: AssignTextureCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'texture assign', 'texture assign failed', () => {
      const cubeApi = getCubeApi();
      const textureApi = getTextureApi();
      if ('error' in cubeApi || 'error' in textureApi) {
        return { code: 'invalid_state', message: ADAPTER_CUBE_TEXTURE_API_UNAVAILABLE };
      }
      const texture = findTextureRef(params.textureName, params.textureId);
      if (!texture) {
        const label = params.textureId ?? params.textureName ?? 'unknown';
        return { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) };
      }
      const cubes = resolveTargetCubes(params);
      if (cubes.length === 0) {
        return { code: 'invalid_payload', message: TEXTURE_ASSIGN_NO_TARGETS };
      }
      const supportsApply = cubes.every((cube) => typeof cube.applyTexture === 'function');
      if (!supportsApply) {
        return { code: 'invalid_state', message: ADAPTER_CUBE_APPLY_TEXTURE_UNAVAILABLE };
      }
      const faces = normalizeFaces(params.faces);
      const textureRef = resolveFaceTextureRef(texture);
      withUndo({ elements: true, textures: true }, 'Assign texture', () => {
        cubes.forEach((cube) => {
          enforceManualUvMode(cube, { preserve: true });
          const faceMap = ensureFaceMap(cube);
          const targets = faces ?? ALL_FACES;
          const uvBackup = new Map<CubeFaceDirection, [number, number, number, number] | undefined>();
          targets.forEach((faceKey) => {
            const face = faceMap[faceKey];
            if (face?.uv) {
              uvBackup.set(faceKey, [...face.uv]);
            }
          });
          cube.applyTexture?.(texture, faces ?? true);
          if (textureRef) {
            targets.forEach((faceKey) => {
              const face = ensureFaceEntry(faceMap, faceKey);
              if (!extendEntity(face, { texture: textureRef })) {
                face.texture = textureRef;
              }
            });
          }
          uvBackup.forEach((uv, faceKey) => {
            if (!uv) return;
            const face = faceMap[faceKey];
            if (!face) return;
            if (!extendEntity(face, { uv })) {
              face.uv = uv;
            }
          });
        });
      });
      this.log.info('texture assigned', { texture: texture?.name, cubeCount: cubes.length, faces: faces ?? 'all' });
      return null;
    });
  }
}
