import type {
  PaintMeshFacePayload,
  PaintMeshFaceResult
} from '@ashfox/contracts/types/internal';
import type { ToolError } from '@ashfox/contracts/types/internal';
import { checkDimensions, mapDimensionError } from '../../domain/dimensions';
import { isTextureOp, type TextureOpLike } from '../../domain/textureOps';
import { applyTextureOps, parseHexColor } from '../../domain/texturePaint';
import { applyUvPaintPixels } from '../../domain/uv/paintPixels';
import {
  DIMENSION_INTEGER_MESSAGE,
  DIMENSION_POSITIVE_MESSAGE,
  TEXTURE_MESH_FACE_COORD_SPACE_INVALID,
  TEXTURE_MESH_FACE_NOT_FOUND,
  TEXTURE_MESH_FACE_NO_PAINTABLE_FACES,
  TEXTURE_MESH_FACE_OP_OUTSIDE_SOURCE,
  TEXTURE_MESH_FACE_OP_OUTSIDE_TARGET,
  TEXTURE_MESH_FACE_OP_REQUIRED,
  TEXTURE_MESH_FACE_GUARD_ROLLBACK,
  TEXTURE_MESH_FACE_SCOPE_ALL_FORBIDS_FACE_ID,
  TEXTURE_MESH_FACE_SCOPE_INVALID,
  TEXTURE_MESH_FACE_SCOPE_SINGLE_REQUIRES_FACE_ID,
  TEXTURE_MESH_FACE_SIZE_REQUIRED,
  TEXTURE_MESH_FACE_TARGET_REQUIRED,
  TEXTURE_MESH_FACE_TARGET_SELECTOR_REQUIRED,
  TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_MISMATCH,
  TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_REQUIRED,
  TEXTURE_MESH_FACE_TEXTURE_REQUIRED,
  TEXTURE_MESH_FACE_UV_REQUIRED,
  TEXTURE_OP_COLOR_INVALID,
  TEXTURE_OP_INVALID,
  TEXTURE_OP_LINEWIDTH_INVALID,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX,
  TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX,
  TEXTURE_RENDERER_NO_IMAGE,
  TEXTURE_RENDERER_UNAVAILABLE,
  UV_PAINT_SOURCE_DATA_MISMATCH,
  UV_PAINT_SOURCE_TARGET_POSITIVE
} from '../../shared/messages';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { fail, ok, type UsecaseResult } from '../result';
import { resolveMeshTarget } from '../targetResolvers';
import type { TextureToolContext } from './context';
import { uvPaintPixelMessages } from './context';
import {
  countChangedPixels,
  doesBoundsIntersectCanvas,
  doesBoundsIntersectRects,
  getRectSpan,
  getTextureOpBounds,
  mergeRects,
  overlayPatchRects,
  overlayTextureSpaceRects,
  type Rect
} from './paintFacesPixels';

type SnapshotTexture = ReturnType<TextureToolContext['getSnapshot']>['textures'][number];
type SnapshotMesh = NonNullable<ReturnType<TextureToolContext['getSnapshot']>['meshes']>[number];
type SnapshotMeshFace = SnapshotMesh['faces'][number];

type NormalizedMeshTarget = {
  meshId?: string;
  meshName?: string;
  faceId?: string;
  scope: 'single_face' | 'all_faces';
};

type NormalizedPaintMeshInput = {
  target: NormalizedMeshTarget;
  coordSpace: 'face' | 'texture';
  mapping: 'stretch' | 'tile';
  op: TextureOpLike;
};

type MeshFaceRect = {
  faceId: string;
  rect: Rect;
};

type TextureReadSource = {
  textureWidth: number;
  textureHeight: number;
  image: CanvasImageSource;
  pixels: Uint8ClampedArray;
};

type PixelStats = {
  opaquePixels: number;
  checksum: number;
};

type SourceSize = {
  sourceWidth: number;
  sourceHeight: number;
};

export const runPaintMeshFace = (
  ctx: TextureToolContext,
  payload: PaintMeshFacePayload
): UsecaseResult<PaintMeshFaceResult> => {
  if (!ctx.textureRenderer) {
    return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }

  const activeErr = ctx.ensureActive();
  if (activeErr) return fail(activeErr);
  const revisionErr = ctx.ensureRevisionMatch(payload.ifRevision);
  if (revisionErr) return fail(revisionErr);

  const normalizedInputRes = normalizePaintMeshInput(payload);
  if (!normalizedInputRes.ok) return fail(normalizedInputRes.error);
  const normalizedInput = normalizedInputRes.value;

  const snapshot = ctx.getSnapshot();
  const meshResolved = resolveMeshTarget(
    snapshot.meshes ?? [],
    normalizedInput.target.meshId,
    normalizedInput.target.meshName,
    {
      required: { message: TEXTURE_MESH_FACE_TARGET_SELECTOR_REQUIRED },
      idLabel: 'meshId',
      nameLabel: 'meshName'
    }
  );
  if (meshResolved.error || !meshResolved.target) {
    return fail(
      meshResolved.error ?? {
        code: 'invalid_payload',
        message: TEXTURE_MESH_FACE_TARGET_SELECTOR_REQUIRED
      }
    );
  }
  const targetMesh = meshResolved.target;

  const faceRectsRes = resolveMeshFaceRects(
    targetMesh,
    normalizedInput.target.scope,
    normalizedInput.target.faceId
  );
  if (!faceRectsRes.ok) return fail(faceRectsRes.error);
  const faceRects = faceRectsRes.value.rects;
  const faceBounds = mergeRects(faceRects.map((entry) => entry.rect));
  if (!faceBounds) {
    return fail({
      code: 'invalid_state',
      message: TEXTURE_MESH_FACE_NO_PAINTABLE_FACES
    });
  }

  const defaultTextureName = snapshot.name ?? undefined;
  const textureName = payload.textureName ?? defaultTextureName ?? undefined;
  const textureId = payload.textureId;
  if (!textureName && !textureId) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_TEXTURE_REQUIRED });
  }

  const runner =
    ctx.runWithoutRevisionGuard ?? ((fn: () => UsecaseResult<PaintMeshFaceResult>) => fn());
  return runner(() => {
    const resolvedTextureRes = resolveTextureForMeshPaint(
      ctx,
      payload,
      snapshot,
      textureId,
      textureName
    );
    if (!resolvedTextureRes.ok) return fail(resolvedTextureRes.error);
    const resolvedTexture = resolvedTextureRes.value;

    const textureSourceRes = readTextureSource(
      ctx,
      ctx.textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
      resolvedTexture
    );
    if (!textureSourceRes.ok) return fail(textureSourceRes.error);
    const textureSource = textureSourceRes.value;
    const beforeStats = summarizePixels(textureSource.pixels);

    const sourceSizeRes = resolveSourceSize(
      ctx,
      payload,
      normalizedInput.coordSpace,
      textureSource,
      faceBounds
    );
    if (!sourceSizeRes.ok) return fail(sourceSizeRes.error);
    const sourceSize = sourceSizeRes.value;

    const boundsRes = validatePaintBounds(
      normalizedInput.coordSpace,
      normalizedInput.op,
      faceRects.map((entry) => entry.rect),
      faceBounds,
      sourceSize
    );
    if (!boundsRes.ok) return fail(boundsRes.error);

    const appliedPixelsRes = applyPaintToMeshFaces({
      textureWidth: textureSource.textureWidth,
      textureHeight: textureSource.textureHeight,
      sourceWidth: sourceSize.sourceWidth,
      sourceHeight: sourceSize.sourceHeight,
      currentPixels: textureSource.pixels,
      rects: faceRects.map((entry) => entry.rect),
      op: normalizedInput.op,
      coordSpace: normalizedInput.coordSpace,
      mapping: normalizedInput.mapping,
      textureLabel: resolvedTexture.name
    });
    if (!appliedPixelsRes.ok) return fail(appliedPixelsRes.error);

    const renderRes = (ctx.textureRenderer as NonNullable<TextureToolContext['textureRenderer']>)
      .renderPixels({
        width: textureSource.textureWidth,
        height: textureSource.textureHeight,
        data: appliedPixelsRes.value.pixels
      });
    if (renderRes.error) return fail(renderRes.error);
    if (!renderRes.result) {
      return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_NO_IMAGE });
    }

    const updateRes = ctx.updateTexture({
      id: resolvedTexture.id,
      name: resolvedTexture.name,
      image: renderRes.result.image,
      width: textureSource.textureWidth,
      height: textureSource.textureHeight,
      ifRevision: payload.ifRevision
    });
    if (!updateRes.ok && updateRes.error.code !== 'no_change') return fail(updateRes.error);

    if (appliedPixelsRes.value.changedPixels > 0) {
      const committedPixelsRes = readTexturePixels(
        ctx,
        ctx.textureRenderer as NonNullable<TextureToolContext['textureRenderer']>,
        resolvedTexture,
        textureSource.textureWidth,
        textureSource.textureHeight
      );
      if (!committedPixelsRes.ok) return fail(committedPixelsRes.error);

      const committedStats = summarizePixels(committedPixelsRes.value);
      const noCommittedDelta = countChangedPixels(textureSource.pixels, committedPixelsRes.value) === 0;
      const lostOpacity = beforeStats.opaquePixels > 0 && committedStats.opaquePixels === 0;

      if (lostOpacity || noCommittedDelta) {
        const rollbackError = rollbackTexturePixels(
          ctx,
          resolvedTexture,
          textureSource.textureWidth,
          textureSource.textureHeight,
          textureSource.pixels,
          payload.ifRevision
        );
        return fail({
          code: 'invalid_state',
          message: TEXTURE_MESH_FACE_GUARD_ROLLBACK,
          details: {
            reason: lostOpacity ? 'all_transparent_after_commit' : 'no_committed_delta',
            rollbackApplied: rollbackError ? false : true,
            rollbackError: rollbackError ? rollbackError.message : undefined,
            expectedChangedPixels: appliedPixelsRes.value.changedPixels,
            beforeOpaquePixels: beforeStats.opaquePixels,
            afterOpaquePixels: committedStats.opaquePixels,
            beforeChecksum: beforeStats.checksum,
            afterChecksum: committedStats.checksum
          }
        });
      }
    }

    const result: PaintMeshFaceResult = {
      textureName: resolvedTexture.name,
      meshId: targetMesh.id ?? undefined,
      meshName: targetMesh.name,
      scope: normalizedInput.target.scope,
      width: textureSource.textureWidth,
      height: textureSource.textureHeight,
      targets: 1,
      facesApplied: faceRects.length,
      opsApplied: 1,
      changedPixels: appliedPixelsRes.value.changedPixels,
      resolvedSource: {
        coordSpace: normalizedInput.coordSpace,
        width: sourceSize.sourceWidth,
        height: sourceSize.sourceHeight,
        faceUv: [faceBounds.x1, faceBounds.y1, faceBounds.x2, faceBounds.y2]
      }
    };
    if (faceRectsRes.value.skippedFaces.length > 0) {
      result.skippedFaces = faceRectsRes.value.skippedFaces;
    }
    return ok(result);
  });
};

const normalizePaintMeshInput = (
  payload: PaintMeshFacePayload
): UsecaseResult<NormalizedPaintMeshInput> => {
  if (!payload.target || typeof payload.target !== 'object') {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_TARGET_REQUIRED });
  }
  const idBlankErr = ensureNonBlankString(payload.target.meshId, 'meshId');
  if (idBlankErr) return fail(idBlankErr);
  const nameBlankErr = ensureNonBlankString(payload.target.meshName, 'meshName');
  if (nameBlankErr) return fail(nameBlankErr);
  const faceIdBlankErr = ensureNonBlankString(payload.target.faceId, 'target.faceId');
  if (faceIdBlankErr) return fail(faceIdBlankErr);
  if (!payload.target.meshId && !payload.target.meshName) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_TARGET_SELECTOR_REQUIRED });
  }

  const scopeRaw = payload.scope;
  if (scopeRaw && scopeRaw !== 'single_face' && scopeRaw !== 'all_faces') {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_SCOPE_INVALID });
  }
  const scope: 'single_face' | 'all_faces' = scopeRaw
    ?? (payload.target.faceId ? 'single_face' : 'all_faces');
  if (scope === 'single_face' && !payload.target.faceId) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_SCOPE_SINGLE_REQUIRES_FACE_ID });
  }
  if (scope === 'all_faces' && payload.target.faceId) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_SCOPE_ALL_FORBIDS_FACE_ID });
  }

  if (!payload.op || typeof payload.op !== 'object' || !isTextureOp(payload.op)) {
    if (!payload.op || typeof payload.op !== 'object') {
      return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_OP_REQUIRED });
    }
    return fail({ code: 'invalid_payload', message: TEXTURE_OP_INVALID('paint_mesh_face') });
  }

  const coordSpace = payload.coordSpace ?? 'face';
  if (coordSpace !== 'face' && coordSpace !== 'texture') {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_COORD_SPACE_INVALID });
  }

  const mapping = payload.mapping ?? 'stretch';
  if (mapping !== 'stretch' && mapping !== 'tile') {
    return fail({ code: 'invalid_payload', message: TEXTURE_OP_INVALID('paint_mesh_face') });
  }

  return ok({
    target: {
      meshId: payload.target.meshId,
      meshName: payload.target.meshName,
      faceId: payload.target.faceId,
      scope
    },
    coordSpace,
    mapping,
    op: payload.op
  });
};

const resolveMeshFaceRects = (
  mesh: SnapshotMesh,
  scope: 'single_face' | 'all_faces',
  faceId: string | undefined
): UsecaseResult<{ rects: MeshFaceRect[]; skippedFaces: Array<{ faceId: string; reason: string }> }> => {
  if (scope === 'single_face') {
    const found = mesh.faces.find((face) => face.id === faceId);
    if (!found || !faceId) {
      return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_NOT_FOUND(faceId ?? 'unknown') });
    }
    const rect = toMeshFaceRect(found);
    if (!rect) {
      return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_UV_REQUIRED(faceId) });
    }
    return ok({
      rects: [{ faceId, rect }],
      skippedFaces: []
    });
  }

  const rects: MeshFaceRect[] = [];
  const skippedFaces: Array<{ faceId: string; reason: string }> = [];
  mesh.faces.forEach((face, index) => {
    const resolvedFaceId = resolveFaceId(face, index);
    const rect = toMeshFaceRect(face);
    if (!rect) {
      skippedFaces.push({ faceId: resolvedFaceId, reason: 'missing_or_invalid_uv' });
      return;
    }
    rects.push({ faceId: resolvedFaceId, rect });
  });

  if (rects.length === 0) {
    return fail({
      code: 'invalid_state',
      message: TEXTURE_MESH_FACE_NO_PAINTABLE_FACES,
      details: { skippedFaces }
    });
  }
  return ok({ rects, skippedFaces });
};

const toMeshFaceRect = (face: SnapshotMeshFace): Rect | null => {
  if (!Array.isArray(face.uv) || face.uv.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const point of face.uv) {
    const x = Number(point?.uv?.[0]);
    const y = Number(point?.uv?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    count += 1;
  }
  if (count < 3) return null;
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  if (maxX <= minX || maxY <= minY) return null;
  return { x1: minX, y1: minY, x2: maxX, y2: maxY };
};

const resolveFaceId = (face: SnapshotMeshFace, index: number): string => {
  const id = typeof face.id === 'string' ? face.id.trim() : '';
  return id.length > 0 ? id : `face_${index}`;
};

const resolveTextureForMeshPaint = (
  ctx: TextureToolContext,
  payload: PaintMeshFacePayload,
  snapshot: ReturnType<TextureToolContext['getSnapshot']>,
  textureId: string | undefined,
  textureName: string | undefined
): UsecaseResult<SnapshotTexture> => {
  const textures = snapshot.textures;
  const byId = textureId ? textures.find((tex) => tex.id === textureId) : undefined;
  const byName = textureName ? textures.find((tex) => tex.name === textureName) : undefined;
  if (byId && byName && byId.name !== byName.name) {
    return fail({
      code: 'invalid_payload',
      message: buildIdNameMismatchMessage({
        kind: 'Texture',
        plural: 'textures',
        idLabel: 'textureId',
        nameLabel: 'textureName',
        id: textureId as string,
        name: textureName as string
      })
    });
  }

  let resolvedTexture = byId ?? byName ?? null;
  if (!resolvedTexture) {
    if (!ctx.createBlankTexture) {
      return fail({ code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
    }
    const fallbackResolution = ctx.editor.getProjectTextureResolution() ?? { width: 16, height: 16 };
    const createWidth = Number(payload.width ?? fallbackResolution.width);
    const createHeight = Number(payload.height ?? fallbackResolution.height);
    const maxSize = ctx.capabilities.limits.maxTextureSize;
    const sizeCheck = checkDimensions(createWidth, createHeight, { requireInteger: true, maxSize });
    if (!sizeCheck.ok) {
      const sizeMessage = mapDimensionError(sizeCheck, {
        nonPositive: (axis) => DIMENSION_POSITIVE_MESSAGE(axis, axis),
        nonInteger: (axis) => DIMENSION_INTEGER_MESSAGE(axis, axis),
        exceedsMax: (limit) => TEXTURE_PAINT_SIZE_EXCEEDS_MAX(limit || maxSize)
      });
      if (sizeCheck.reason === 'exceeds_max') {
        return fail({
          code: 'invalid_payload',
          message: sizeMessage ?? TEXTURE_PAINT_SIZE_EXCEEDS_MAX(maxSize),
          fix: TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX(maxSize),
          details: { width: createWidth, height: createHeight, maxSize }
        });
      }
      return fail({ code: 'invalid_payload', message: sizeMessage ?? DIMENSION_POSITIVE_MESSAGE('width/height') });
    }

    const created = ctx.createBlankTexture({
      name: textureName ?? 'texture',
      width: createWidth,
      height: createHeight,
      allowExisting: true
    });
    if (!created.ok) return fail(created.error);

    const refreshed = ctx.getSnapshot();
    const refreshedById = textureId ? refreshed.textures.find((tex) => tex.id === textureId) : undefined;
    const refreshedByName = textureName ? refreshed.textures.find((tex) => tex.name === textureName) : undefined;
    resolvedTexture = refreshedById ?? refreshedByName ?? null;
  }

  if (!resolvedTexture) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_TEXTURE_REQUIRED });
  }
  return ok(resolvedTexture);
};

const readTextureSource = (
  ctx: TextureToolContext,
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>,
  texture: SnapshotTexture
): UsecaseResult<TextureReadSource> => {
  const textureReadRes = ctx.editor.readTexture({
    id: texture.id,
    name: texture.name
  });
  if (textureReadRes.error || !textureReadRes.result || !textureReadRes.result.image) {
    return fail(textureReadRes.error ?? { code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });
  }
  const textureWidth =
    textureReadRes.result.width ?? texture.width ?? ctx.editor.getProjectTextureResolution()?.width ?? undefined;
  const textureHeight =
    textureReadRes.result.height ?? texture.height ?? ctx.editor.getProjectTextureResolution()?.height ?? undefined;
  if (!textureWidth || !textureHeight) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_SIZE_REQUIRED });
  }

  const readPixelsRes = textureRenderer.readPixels?.({
    image: textureReadRes.result.image,
    width: textureWidth,
    height: textureHeight
  });
  if (!readPixelsRes || readPixelsRes.error || !readPixelsRes.result) {
    return fail(readPixelsRes?.error ?? { code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  return ok({
    textureWidth,
    textureHeight,
    image: textureReadRes.result.image,
    pixels: readPixelsRes.result.data
  });
};

const readTexturePixels = (
  ctx: TextureToolContext,
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>,
  texture: SnapshotTexture,
  expectedWidth: number,
  expectedHeight: number
): UsecaseResult<Uint8ClampedArray> => {
  const readRes = ctx.editor.readTexture({
    id: texture.id,
    name: texture.name
  });
  if (readRes.error || !readRes.result?.image) {
    return fail(readRes.error ?? { code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE });
  }

  const width = readRes.result.width ?? expectedWidth;
  const height = readRes.result.height ?? expectedHeight;
  const pixelsRes = textureRenderer.readPixels?.({
    image: readRes.result.image,
    width,
    height
  });
  if (!pixelsRes || pixelsRes.error || !pixelsRes.result) {
    return fail(pixelsRes?.error ?? { code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE });
  }
  return ok(pixelsRes.result.data);
};

const rollbackTexturePixels = (
  ctx: TextureToolContext,
  texture: SnapshotTexture,
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  ifRevision: string | undefined
): ToolError | null => {
  if (!ctx.textureRenderer) {
    return { code: 'not_implemented', message: TEXTURE_RENDERER_UNAVAILABLE };
  }
  const renderRes = ctx.textureRenderer.renderPixels({
    width,
    height,
    data: pixels
  });
  if (renderRes.error || !renderRes.result?.image) {
    return renderRes.error ?? { code: 'invalid_state', message: TEXTURE_RENDERER_NO_IMAGE };
  }
  const updateRes = ctx.updateTexture({
    id: texture.id,
    name: texture.name,
    image: renderRes.result.image,
    width,
    height,
    ifRevision
  });
  if (!updateRes.ok && updateRes.error.code !== 'no_change') {
    return updateRes.error;
  }
  return null;
};

const resolveSourceSize = (
  ctx: TextureToolContext,
  payload: PaintMeshFacePayload,
  coordSpace: 'face' | 'texture',
  textureSource: TextureReadSource,
  faceBounds: Rect
): UsecaseResult<SourceSize> => {
  const faceSourceWidth = getRectSpan(faceBounds.x1, faceBounds.x2);
  const faceSourceHeight = getRectSpan(faceBounds.y1, faceBounds.y2);
  let sourceWidth = Number(payload.width ?? faceSourceWidth);
  let sourceHeight = Number(payload.height ?? faceSourceHeight);

  if (
    coordSpace === 'texture' &&
    (payload.width === undefined || payload.height === undefined)
  ) {
    return fail({ code: 'invalid_payload', message: TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_REQUIRED });
  }

  const maxSize = ctx.capabilities.limits.maxTextureSize;
  const sourceCheck = checkDimensions(sourceWidth, sourceHeight, { requireInteger: true, maxSize });
  if (!sourceCheck.ok) {
    const sourceMessage = mapDimensionError(sourceCheck, {
      nonPositive: (axis) => DIMENSION_POSITIVE_MESSAGE(axis, axis),
      nonInteger: (axis) => DIMENSION_INTEGER_MESSAGE(axis, axis),
      exceedsMax: (limit) => TEXTURE_PAINT_SIZE_EXCEEDS_MAX(limit || maxSize)
    });
    if (sourceCheck.reason === 'exceeds_max') {
      return fail({
        code: 'invalid_payload',
        message: sourceMessage ?? TEXTURE_PAINT_SIZE_EXCEEDS_MAX(maxSize),
        fix: TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX(maxSize),
        details: { width: sourceWidth, height: sourceHeight, maxSize }
      });
    }
    return fail({
      code: 'invalid_payload',
      message: sourceMessage ?? DIMENSION_POSITIVE_MESSAGE('width/height')
    });
  }

  sourceWidth = Math.trunc(sourceWidth);
  sourceHeight = Math.trunc(sourceHeight);
  if (
    coordSpace === 'texture' &&
    (sourceWidth !== textureSource.textureWidth || sourceHeight !== textureSource.textureHeight)
  ) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_MISMATCH(
        textureSource.textureWidth,
        textureSource.textureHeight,
        sourceWidth,
        sourceHeight
      )
    });
  }
  return ok({ sourceWidth, sourceHeight });
};

const validatePaintBounds = (
  coordSpace: 'face' | 'texture',
  op: TextureOpLike,
  rects: Rect[],
  faceBounds: Rect,
  sourceSize: SourceSize
): UsecaseResult<void> => {
  const opBounds = getTextureOpBounds(op);
  if (!doesBoundsIntersectCanvas(opBounds, sourceSize.sourceWidth, sourceSize.sourceHeight)) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_MESH_FACE_OP_OUTSIDE_SOURCE(
        coordSpace,
        sourceSize.sourceWidth,
        sourceSize.sourceHeight
      ),
      details: {
        coordSpace,
        sourceWidth: sourceSize.sourceWidth,
        sourceHeight: sourceSize.sourceHeight,
        opBounds
      }
    });
  }
  if (coordSpace === 'texture' && !doesBoundsIntersectRects(opBounds, rects)) {
    return fail({
      code: 'invalid_payload',
      message: TEXTURE_MESH_FACE_OP_OUTSIDE_TARGET,
      details: {
        coordSpace,
        opBounds,
        faceUv: [faceBounds.x1, faceBounds.y1, faceBounds.x2, faceBounds.y2]
      }
    });
  }
  return ok(undefined);
};

const applyPaintToMeshFaces = (params: {
  textureWidth: number;
  textureHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  currentPixels: Uint8ClampedArray;
  rects: Rect[];
  op: TextureOpLike;
  coordSpace: 'face' | 'texture';
  mapping: 'stretch' | 'tile';
  textureLabel: string;
}): UsecaseResult<{ pixels: Uint8ClampedArray; changedPixels: number }> => {
  if (params.currentPixels.length !== params.textureWidth * params.textureHeight * 4) {
    return fail({ code: 'invalid_payload', message: UV_PAINT_SOURCE_DATA_MISMATCH(params.textureLabel) });
  }
  if (params.sourceWidth <= 0 || params.sourceHeight <= 0 || params.textureWidth <= 0 || params.textureHeight <= 0) {
    return fail({ code: 'invalid_payload', message: UV_PAINT_SOURCE_TARGET_POSITIVE(params.textureLabel) });
  }

  const pixels = new Uint8ClampedArray(params.currentPixels);
  const before = new Uint8ClampedArray(params.currentPixels);

  if (params.coordSpace === 'face') {
    const sourceData = new Uint8ClampedArray(params.sourceWidth * params.sourceHeight * 4);
    const applyRes = applySingleTextureOp(
      sourceData,
      params.sourceWidth,
      params.sourceHeight,
      params.op,
      params.textureLabel
    );
    if (!applyRes.ok) return applyRes;

    const patchRes = applyUvPaintPixels({
      source: { width: params.sourceWidth, height: params.sourceHeight, data: sourceData },
      target: { width: params.textureWidth, height: params.textureHeight },
      config: { rects: params.rects, mapping: params.mapping, padding: 0, anchor: [0, 0] },
      label: params.textureLabel,
      messages: uvPaintPixelMessages
    });
    if (!patchRes.ok) return fail(patchRes.error);

    overlayPatchRects(
      pixels,
      patchRes.data.data,
      params.rects,
      params.textureWidth,
      params.textureHeight
    );
    return ok({
      pixels,
      changedPixels: countChangedPixels(before, pixels)
    });
  }

  const textureSpace = new Uint8ClampedArray(pixels);
  const applyRes = applySingleTextureOp(
    textureSpace,
    params.sourceWidth,
    params.sourceHeight,
    params.op,
    params.textureLabel
  );
  if (!applyRes.ok) return applyRes;

  overlayTextureSpaceRects(
    pixels,
    textureSpace,
    params.rects,
    params.textureWidth,
    params.textureHeight
  );
  return ok({
    pixels,
    changedPixels: countChangedPixels(before, pixels)
  });
};

const applySingleTextureOp = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  op: TextureOpLike,
  textureLabel: string
): UsecaseResult<void> => {
  const res = applyTextureOps(pixels, width, height, [op], parseHexColor);
  if (!res.ok) {
    const reason = mapTextureOpFailureReason(res.reason, textureLabel);
    return fail({ code: 'invalid_payload', message: reason, details: { opIndex: res.opIndex } });
  }
  return ok(undefined);
};

const mapTextureOpFailureReason = (
  reason: 'invalid_color' | 'invalid_line_width' | 'invalid_op',
  textureLabel: string
): string => {
  switch (reason) {
    case 'invalid_line_width':
      return TEXTURE_OP_LINEWIDTH_INVALID(textureLabel);
    case 'invalid_op':
      return TEXTURE_OP_INVALID(textureLabel);
    default:
      return TEXTURE_OP_COLOR_INVALID(textureLabel);
  }
};

const summarizePixels = (pixels: Uint8ClampedArray): PixelStats => {
  let opaquePixels = 0;
  let checksum = 2166136261;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) opaquePixels += 1;
    checksum ^= pixels[i];
    checksum = Math.imul(checksum, 16777619);
    checksum ^= pixels[i + 1];
    checksum = Math.imul(checksum, 16777619);
    checksum ^= pixels[i + 2];
    checksum = Math.imul(checksum, 16777619);
    checksum ^= pixels[i + 3];
    checksum = Math.imul(checksum, 16777619);
  }
  return { opaquePixels, checksum: checksum >>> 0 };
};
