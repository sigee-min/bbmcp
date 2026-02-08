import type { ToolError } from '@ashfox/contracts/types/internal';
import type { TextureToolContext } from './context';
import { countOpaquePixels, isSuspiciousOpaqueDrop } from './paintFacesPixels';

export type TextureBackup = {
  image: CanvasImageSource;
  width: number;
  height: number;
  opaquePixels: number;
};

export const captureTextureBackup = (
  ctx: TextureToolContext,
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>,
  texture: { id?: string; name?: string; width?: number; height?: number }
): TextureBackup | null => {
  const readRes = ctx.editor.readTexture({ id: texture.id, name: texture.name });
  if (readRes.error || !readRes.result?.image) return null;
  const width = Number(readRes.result.width ?? texture.width ?? 0);
  const height = Number(readRes.result.height ?? texture.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const pixelRes = textureRenderer.readPixels?.({
    image: readRes.result.image,
    width,
    height
  });
  if (!pixelRes || pixelRes.error || !pixelRes.result) return null;
  return {
    image: readRes.result.image,
    width,
    height,
    opaquePixels: countOpaquePixels(pixelRes.result.data)
  };
};

export const maybeRollbackTextureLoss = (params: {
  ctx: TextureToolContext;
  textureRenderer: NonNullable<TextureToolContext['textureRenderer']>;
  texture: { id?: string; name: string; width?: number; height?: number };
  ifRevision?: string;
  recoveryAttempts: number;
  backup: TextureBackup | null;
}): ToolError | null => {
  if (params.recoveryAttempts <= 0 || !params.backup) return null;
  const readRes = params.ctx.editor.readTexture({ id: params.texture.id, name: params.texture.name });
  if (readRes.error || !readRes.result?.image) return null;
  const width = Number(readRes.result.width ?? params.texture.width ?? params.backup.width);
  const height = Number(readRes.result.height ?? params.texture.height ?? params.backup.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const pixelRes = params.textureRenderer.readPixels?.({
    image: readRes.result.image,
    width,
    height
  });
  if (!pixelRes || pixelRes.error || !pixelRes.result) return null;
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
    message: 'paint_faces recovery produced severe texture loss; texture was rolled back.',
    details: {
      reason: 'texture_recovery_guard',
      recoveryAttempts: params.recoveryAttempts,
      beforeOpaquePixels: params.backup.opaquePixels,
      afterOpaquePixels: currentOpaque
    }
  };
};

