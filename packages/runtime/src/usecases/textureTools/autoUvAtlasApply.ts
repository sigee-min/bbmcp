import { reprojectTexturePixels } from '../../domain/textureReproject';
import type { TextureUsage, CubeFaceDirection } from '../../domain/model';
import type { AtlasPlan } from '../../domain/uv/atlas';
import type { AutoUvAtlasPayload, ToolError } from '@ashfox/contracts/types/internal';
import {
  TEXTURE_AUTO_UV_SOURCE_MISSING,
  TEXTURE_AUTO_UV_SOURCE_SIZE_MISSING
} from '../../shared/messages';
import { fail, ok, type UsecaseResult } from '../result';
import type { TextureToolContext } from './context';

type FaceUvMap = Partial<Record<CubeFaceDirection, [number, number, number, number]>>;

type TextureBackup = {
  image: CanvasImageSource;
  width: number;
  height: number;
  opaquePixels: number;
};

export type ReprojectTextureRenderer = NonNullable<TextureToolContext['textureRenderer']> & {
  readPixels: NonNullable<NonNullable<TextureToolContext['textureRenderer']>['readPixels']>;
};

export const toReprojectTextureRenderer = (
  renderer: TextureToolContext['textureRenderer']
): ReprojectTextureRenderer | null => {
  if (!renderer || typeof renderer.readPixels !== 'function') return null;
  return renderer as ReprojectTextureRenderer;
};

export const applyAutoUvAtlasPlan = (params: {
  ctx: TextureToolContext;
  payload: AutoUvAtlasPayload;
  usage: TextureUsage;
  plan: AtlasPlan;
  textureRenderer: ReprojectTextureRenderer;
}): UsecaseResult<void> => {
  const assignmentByFace = buildAssignmentByFace(params.plan);
  const applyTextures = applyAtlasTextures({
    ...params,
    assignmentByFace
  });
  if (!applyTextures.ok) return applyTextures;

  const applyFaces = applyFaceUvAssignments(params.ctx, params.plan);
  if (!applyFaces.ok) return applyFaces;
  return ok(undefined);
};

const applyAtlasTextures = (params: {
  ctx: TextureToolContext;
  payload: AutoUvAtlasPayload;
  usage: TextureUsage;
  plan: AtlasPlan;
  textureRenderer: ReprojectTextureRenderer;
  assignmentByFace: Map<string, [number, number, number, number]>;
}): UsecaseResult<void> => {
  for (const texture of params.usage.textures) {
    const mappings = collectReprojectMappings(texture, params.assignmentByFace);
    const sourceRes = params.ctx.editor.readTexture({ id: texture.id, name: texture.name });
    if (sourceRes.error || !sourceRes.result) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_SOURCE_MISSING(texture.name)
      });
    }
    const source = sourceRes.result;
    if (!source.image) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_SOURCE_MISSING(texture.name)
      });
    }
    const sourceWidth = source.width ?? texture.width;
    const sourceHeight = source.height ?? texture.height;
    if (!sourceWidth || !sourceHeight) {
      return fail({
        code: 'invalid_state',
        message: TEXTURE_AUTO_UV_SOURCE_SIZE_MISSING(texture.name)
      });
    }

    if (mappings.length === 0) {
      mappings.push({
        from: [0, 0, sourceWidth, sourceHeight],
        to: [0, 0, params.plan.resolution.width, params.plan.resolution.height]
      });
    }

    const readRes = params.textureRenderer.readPixels({
      image: source.image,
      width: sourceWidth,
      height: sourceHeight
    });
    if (readRes.error || !readRes.result) {
      return fail(readRes.error ?? { code: 'unknown', message: 'read failed' });
    }

    const backup = captureTextureBackup({
      textureRenderer: params.textureRenderer,
      image: source.image,
      width: readRes.result.width,
      height: readRes.result.height,
      data: readRes.result.data
    });

    const pixels = reprojectTexturePixels({
      source: readRes.result.data,
      sourceWidth: readRes.result.width,
      sourceHeight: readRes.result.height,
      destWidth: params.plan.resolution.width,
      destHeight: params.plan.resolution.height,
      mappings
    });
    const renderRes = params.textureRenderer.renderPixels({
      width: params.plan.resolution.width,
      height: params.plan.resolution.height,
      data: pixels
    });
    if (renderRes.error || !renderRes.result) {
      return fail(renderRes.error ?? { code: 'unknown', message: 'render failed' });
    }

    const updateRes = params.ctx.updateTexture({
      id: source.id ?? texture.id,
      name: source.name ?? texture.name,
      image: renderRes.result.image,
      width: params.plan.resolution.width,
      height: params.plan.resolution.height,
      ifRevision: params.payload.ifRevision
    });
    if (!updateRes.ok && updateRes.error.code !== 'no_change') return fail(updateRes.error);
    if (!updateRes.ok) continue;

    const rollbackErr = maybeRollbackTextureLoss({
      ctx: params.ctx,
      textureRenderer: params.textureRenderer,
      texture: {
        id: source.id ?? texture.id,
        name: source.name ?? texture.name,
        width: params.plan.resolution.width,
        height: params.plan.resolution.height
      },
      ifRevision: params.payload.ifRevision,
      backup
    });
    if (rollbackErr) return fail(rollbackErr);
  }
  return ok(undefined);
};

const applyFaceUvAssignments = (
  ctx: TextureToolContext,
  plan: AtlasPlan
): UsecaseResult<void> => {
  const updatesByCube = new Map<string, { cubeId?: string; cubeName: string; faces: FaceUvMap }>();
  plan.assignments.forEach((assignment) => {
    const key = assignment.cubeId ? `id:${assignment.cubeId}` : `name:${assignment.cubeName}`;
    const entry = updatesByCube.get(key) ?? {
      cubeId: assignment.cubeId,
      cubeName: assignment.cubeName,
      faces: {}
    };
    entry.faces[assignment.face] = assignment.uv;
    if (!entry.cubeId && assignment.cubeId) entry.cubeId = assignment.cubeId;
    updatesByCube.set(key, entry);
  });

  for (const entry of updatesByCube.values()) {
    const err = ctx.editor.setFaceUv({
      cubeId: entry.cubeId,
      cubeName: entry.cubeName,
      faces: entry.faces
    });
    if (err) return fail(err);
  }
  return ok(undefined);
};

const buildAssignmentByFace = (plan: AtlasPlan): Map<string, [number, number, number, number]> => {
  const map = new Map<string, [number, number, number, number]>();
  for (const assignment of plan.assignments) {
    map.set(toFaceKey(assignment.cubeId, assignment.cubeName, assignment.face), assignment.uv);
  }
  return map;
};

const collectReprojectMappings = (
  texture: TextureUsage['textures'][number],
  assignmentByFace: Map<string, [number, number, number, number]>
): Array<{ from: [number, number, number, number]; to: [number, number, number, number] }> => {
  const mappings: Array<{ from: [number, number, number, number]; to: [number, number, number, number] }> = [];
  for (const cube of texture.cubes) {
    for (const face of cube.faces) {
      const nextRect = assignmentByFace.get(toFaceKey(cube.id, cube.name, face.face));
      if (!nextRect || !face.uv) continue;
      mappings.push({
        from: face.uv,
        to: nextRect
      });
    }
  }
  return mappings;
};

const toFaceKey = (cubeId: string | undefined, cubeName: string, face: string): string =>
  `${cubeId ? `id:${cubeId}` : `name:${cubeName}`}::${face}`;

const captureTextureBackup = (params: {
  textureRenderer: ReprojectTextureRenderer;
  image: CanvasImageSource;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}): TextureBackup => {
  const snapshot = new Uint8ClampedArray(params.data);
  const renderRes = params.textureRenderer.renderPixels({
    width: params.width,
    height: params.height,
    data: snapshot
  });
  const backupImage = renderRes.error || !renderRes.result?.image ? params.image : renderRes.result.image;
  return {
    image: backupImage,
    width: params.width,
    height: params.height,
    opaquePixels: countOpaquePixels(snapshot)
  };
};

const maybeRollbackTextureLoss = (params: {
  ctx: TextureToolContext;
  textureRenderer: ReprojectTextureRenderer;
  texture: { id?: string; name: string; width?: number; height?: number };
  ifRevision?: string;
  backup: TextureBackup | null;
}): ToolError | null => {
  if (!params.backup) return null;
  const readRes = params.ctx.editor.readTexture({ id: params.texture.id, name: params.texture.name });
  if (readRes.error || !readRes.result?.image) return null;

  const width = Number(readRes.result.width ?? params.texture.width ?? params.backup.width);
  const height = Number(readRes.result.height ?? params.texture.height ?? params.backup.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const pixelRes = params.textureRenderer.readPixels({
    image: readRes.result.image,
    width,
    height
  });
  if (pixelRes.error || !pixelRes.result) return null;

  const currentOpaque = countOpaquePixels(pixelRes.result.data);
  if (!isSuspiciousOpaqueDrop(params.backup.opaquePixels, currentOpaque)) return null;

  const rollbackRes = params.ctx.updateTexture({
    id: params.texture.id,
    name: params.texture.name,
    image: params.backup.image,
    width: params.backup.width,
    height: params.backup.height,
    ifRevision: params.ifRevision
  });
  if (!rollbackRes.ok && rollbackRes.error.code !== 'no_change') return rollbackRes.error;

  return {
    code: 'invalid_state',
    message: 'auto_uv_atlas reproject produced severe texture loss; texture was rolled back.',
    details: {
      reason: 'texture_recovery_guard',
      context: 'auto_uv_atlas',
      beforeOpaquePixels: params.backup.opaquePixels,
      afterOpaquePixels: currentOpaque
    }
  };
};

const countOpaquePixels = (data: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) count += 1;
  }
  return count;
};

const isSuspiciousOpaqueDrop = (
  beforeOpaquePixels: number,
  afterOpaquePixels: number
): boolean => {
  if (!Number.isFinite(beforeOpaquePixels) || !Number.isFinite(afterOpaquePixels)) return false;
  if (beforeOpaquePixels < 256) return false;
  if (afterOpaquePixels >= beforeOpaquePixels) return false;
  const minAllowed = Math.max(64, Math.floor(beforeOpaquePixels * 0.05));
  return afterOpaquePixels < minAllowed;
};
