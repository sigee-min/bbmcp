import type { CubeInstance } from '../../../src/types/blockbench';
import type { ToolError } from '/contracts/types/internal';
import type { BlockbenchSimState } from './simTypes';
import { DEFAULT_TEXTURE_SIZE } from './simConstants';
import { buildBoxUvLayout, ensureFaces, resolveUvOrigin, scaleVec2, error } from './simUtils';

export type SimUvContext = {
  state: BlockbenchSimState;
  syncTextures: () => void;
};

export const createUvOps = (ctx: SimUvContext) => {
  const scaleUvRect = (uv: [number, number, number, number], scaleX: number, scaleY: number): [number, number, number, number] => [
    uv[0] * scaleX,
    uv[1] * scaleY,
    uv[2] * scaleX,
    uv[3] * scaleY
  ];

  const usesAutoUv = (cube: CubeInstance): boolean =>
    Boolean(cube.box_uv) || (typeof cube.autouv === 'number' && cube.autouv > 0);

  const applyAutoUv = (cube: CubeInstance): void => {
    if (!usesAutoUv(cube)) return;
    const origin = resolveUvOrigin(cube);
    const resolution =
      ctx.state.project.textureResolution ?? { width: DEFAULT_TEXTURE_SIZE, height: DEFAULT_TEXTURE_SIZE };
    const layout = buildBoxUvLayout(cube, origin, resolution);
    const faces = ensureFaces(cube);
    Object.entries(layout).forEach(([faceKey, uv]) => {
      const entry = faces[faceKey] ?? { texture: false };
      entry.uv = uv;
      faces[faceKey] = entry;
    });
  };

  const enforceManualUvMode = (cube: CubeInstance, options?: { preserve?: boolean }): void => {
    if (options?.preserve && usesAutoUv(cube)) {
      applyAutoUv(cube);
    }
    if (typeof cube.box_uv === 'boolean') {
      cube.box_uv = false;
    }
    if (typeof cube.autouv === 'number') {
      cube.autouv = 0;
    }
  };

  const applyProjectTextureResolution = (width: number, height: number, modifyUv?: boolean): ToolError | null => {
    const next = { width: Math.trunc(width), height: Math.trunc(height) };
    if (next.width <= 0 || next.height <= 0) {
      return error('invalid_payload', 'Texture resolution must be positive.');
    }
    const prev = ctx.state.project.textureResolution;
    ctx.state.project.textureResolution = next;
    if (prev && prev.width > 0 && prev.height > 0) {
      const scaleX = next.width / prev.width;
      const scaleY = next.height / prev.height;
      ctx.state.cubes.forEach((cube) => {
        if (usesAutoUv(cube)) {
          if (modifyUv) {
            if (cube.uv_offset) cube.uv_offset = scaleVec2(cube.uv_offset, scaleX, scaleY);
            if (cube.uv) cube.uv = scaleVec2(cube.uv, scaleX, scaleY);
          }
          applyAutoUv(cube);
          return;
        }
        if (modifyUv) {
          const faces = cube.faces ?? {};
          Object.values(faces).forEach((face) => {
            if (!face?.uv) return;
            face.uv = scaleUvRect(face.uv, scaleX, scaleY);
          });
        }
      });
    } else {
      ctx.state.cubes.forEach((cube) => applyAutoUv(cube));
    }
    ctx.syncTextures();
    return null;
  };

  return {
    usesAutoUv,
    applyAutoUv,
    enforceManualUvMode,
    applyProjectTextureResolution
  };
};

