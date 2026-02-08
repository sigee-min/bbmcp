import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import type { CubeCommand, DeleteCubeCommand, UpdateCubeCommand } from '../../../ports/editor';
import {
  assignVec2,
  assignVec3,
  attachToOutliner,
  moveOutlinerNode,
  normalizeParent,
  removeOutlinerNode,
  renameEntity,
  setVisibility,
  withUndo
} from '../blockbenchUtils';
import { getCubeApi } from '../blockbenchAdapterUtils';
import { findCubeRef, findGroup } from '../outlinerLookup';
import { withToolErrorAdapterError } from '../adapterErrors';
import { MODEL_BONE_NOT_FOUND, MODEL_CUBE_NOT_FOUND } from '../../../shared/messages';
import { enforceManualUvMode } from './uvUtils';

export class BlockbenchCubeAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  addCube(params: CubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube add', 'cube add failed', () => {
      const api = getCubeApi();
      if ('error' in api) return api.error;
      const { CubeCtor, outliner } = api;
      withUndo({ elements: true, outliner: true }, 'Add cube', () => {
        const parent = normalizeParent(findGroup(params.bone));
        const cube = new CubeCtor({
          name: params.name,
          from: params.from,
          to: params.to,
          origin: params.origin,
          rotation: params.rotation,
          uv_offset: params.uvOffset ?? params.uv,
          box_uv: params.boxUv,
          inflate: params.inflate,
          mirror_uv: params.mirror
        }).init?.();
        if (cube) {
          enforceManualUvMode(cube);
          applyBoxUvMode(cube as Record<string, unknown>, params.boxUv);
          if (params.uvOffset) assignVec2(cube, 'uv_offset', params.uvOffset);
          setVisibility(cube, params.visibility);
          if (params.id) cube.ashfoxId = params.id;
          const attached = attachToOutliner(parent, outliner, cube, this.log, 'cube');
          if (!attached && Array.isArray(outliner?.root)) {
            outliner.root.push(cube);
          }
        }
      });
      this.log.info('cube added', { name: params.name, bone: params.bone });
      return null;
    });
  }

  updateCube(params: UpdateCubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube update', 'cube update failed', () => {
      const api = getCubeApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      if (params.id) {
        target.ashfoxId = params.id;
      }
      const parent = params.boneRoot ? null : params.bone ? findGroup(params.bone) : undefined;
      if (params.bone && !parent) {
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(params.bone) };
      }
      let applyError: ToolError | null = null;
      withUndo({ elements: true, outliner: true }, 'Update cube', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        const wantsManualUv = Boolean(params.uv || params.uvOffset) || params.boxUv === false;
        if (wantsManualUv) {
          enforceManualUvMode(target, { preserve: true });
        }
        const vecError =
          applyVerifiedVec3(target as Record<string, unknown>, 'from', params.from) ??
          applyVerifiedVec3(target as Record<string, unknown>, 'to', params.to) ??
          applyVerifiedVec3(target as Record<string, unknown>, 'origin', params.origin) ??
          applyVerifiedVec3(target as Record<string, unknown>, 'rotation', params.rotation);
        if (vecError) {
          applyError = vecError;
          return;
        }
        if (params.uv) assignVec2(target, 'uv_offset', params.uv);
        if (params.uvOffset) assignVec2(target, 'uv_offset', params.uvOffset);
        if (typeof params.inflate === 'number') target.inflate = params.inflate;
        if (typeof params.mirror === 'boolean') {
          target.mirror_uv = params.mirror;
          if (typeof target.mirror === 'boolean') target.mirror = params.mirror;
        }
        applyBoxUvMode(target as Record<string, unknown>, params.boxUv);
        setVisibility(target, params.visibility);
        if (params.boneRoot || params.bone !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'cube');
        }
      });
      if (applyError) return applyError;
      this.log.info('cube updated', { name: params.name, newName: params.newName, bone: params.bone });
      return null;
    });
  }

  deleteCube(params: DeleteCubeCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'cube delete', 'cube delete failed', () => {
      const api = getCubeApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findCubeRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_CUBE_NOT_FOUND(label) };
      }
      withUndo({ elements: true, outliner: true }, 'Delete cube', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('cube deleted', { name: target?.name ?? params.name });
      return null;
    });
  }
}

type Vec3 = [number, number, number];
type Vec3Like = Vec3 | { x?: number; y?: number; z?: number } | null | undefined;
type Vec3Field = 'from' | 'to' | 'origin' | 'rotation';

const readVec3 = (value: Vec3Like): Vec3 | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
    return [x, y, z];
  }
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
};

const matchesVec3 = (actual: Vec3 | null, expected: Vec3): boolean => {
  if (!actual) return false;
  const epsilon = 1e-6;
  return (
    Math.abs(actual[0] - expected[0]) <= epsilon &&
    Math.abs(actual[1] - expected[1]) <= epsilon &&
    Math.abs(actual[2] - expected[2]) <= epsilon
  );
};

const buildVecMismatchError = (field: string, expected: Vec3, actual: Vec3 | null): ToolError => ({
  code: 'invalid_state',
  message: `Cube update verification failed for ${field}.`,
  details: {
    reason: 'cube_vector_mismatch',
    field,
    expected,
    actual
  }
});

const applyVerifiedVec3 = (
  target: Record<string, unknown>,
  field: Vec3Field,
  value: Vec3 | undefined
): ToolError | null => {
  if (!value) return null;
  assignVec3(target, field, value);
  const actual = readVec3((target as Record<string, unknown>)[field] as Vec3Like);
  if (matchesVec3(actual, value)) return null;
  return buildVecMismatchError(field, value, actual);
};

const applyBoxUvMode = (target: Record<string, unknown>, boxUv: boolean | undefined) => {
  if (typeof boxUv !== 'boolean') return;
  (target as { box_uv?: boolean }).box_uv = boxUv;
  const setUvMode = (target as { setUVMode?: (value: boolean) => void }).setUVMode;
  if (typeof setUvMode === 'function') {
    setUvMode.call(target, boxUv);
  }
};


