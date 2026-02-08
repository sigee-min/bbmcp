import type { TextureInstance } from '../../../types/blockbench';
import { extendEntity } from '../utils/entity';

export const finalizeTextureChange = (tex: TextureInstance): void => {
  if (typeof tex.updateChangesAfterEdit === 'function') {
    tex.updateChangesAfterEdit();
    return;
  }
  if (typeof tex.updateLayerChanges === 'function') {
    tex.updateLayerChanges(true);
  }
};

export const applyTextureDefaults = (tex: TextureInstance): void => {
  if (!tex) return;
  if (tex.internal === undefined) tex.internal = true;
  if (tex.keep_size === undefined) tex.keep_size = true;
};

export const applyTextureDimensions = (tex: TextureInstance, width?: number, height?: number): boolean => {
  const nextWidth = normalizeTextureSize(width);
  const nextHeight = normalizeTextureSize(height);
  if (!nextWidth || !nextHeight) return false;
  let changed = false;
  const needsResize = tex.width !== nextWidth || tex.height !== nextHeight;
  if (typeof tex.setSize === 'function') {
    tex.setSize(nextWidth, nextHeight);
    changed = changed || needsResize;
  } else if (typeof tex.resize === 'function') {
    tex.resize(nextWidth, nextHeight);
    changed = changed || needsResize;
  } else {
    if (tex.width !== nextWidth) {
      tex.width = nextWidth;
      changed = true;
    }
    if (tex.height !== nextHeight) {
      tex.height = nextHeight;
      changed = true;
    }
  }
  const canvas = tex.canvas ?? null;
  if (canvas) {
    if (canvas.width !== nextWidth) {
      canvas.width = nextWidth;
      changed = true;
    }
    if (canvas.height !== nextHeight) {
      canvas.height = nextHeight;
      changed = true;
    }
  }
  if (tex.width !== nextWidth) {
    tex.width = nextWidth;
    changed = true;
  }
  if (tex.height !== nextHeight) {
    tex.height = nextHeight;
    changed = true;
  }
  return changed;
};

export const applyTextureImage = (tex: TextureInstance, source: CanvasImageSource): boolean => {
  if (!tex || !source) return false;
  const canvas = tex.canvas ?? null;
  const ctx = tex.ctx ?? canvas?.getContext?.('2d') ?? null;
  if (canvas && ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return true;
  }
  if (typeof tex.edit === 'function') {
    tex.edit(
      (active: HTMLCanvasElement | unknown) => {
        const activeCanvas = active as HTMLCanvasElement | null;
        if (!activeCanvas) return active as HTMLCanvasElement;
        const activeCtx = activeCanvas.getContext('2d');
        if (!activeCtx) return activeCanvas;
        activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
        activeCtx.drawImage(source, 0, 0, activeCanvas.width, activeCanvas.height);
        return activeCanvas;
      },
      { no_undo: true }
    );
    return true;
  }
  return false;
};

export const applyTextureMeta = (
  tex: TextureInstance,
  params: {
    namespace?: string;
    folder?: string;
    particle?: boolean;
    visible?: boolean;
    renderMode?: string;
    renderSides?: string;
    pbrChannel?: string;
    group?: string;
    frameTime?: number;
    frameOrderType?: string;
    frameOrder?: string;
    frameInterpolate?: boolean;
    internal?: boolean;
    keepSize?: boolean;
  }
): void => {
  if (!tex || !params) return;
  const patch: Record<string, unknown> = {};
  if (params.namespace !== undefined) patch.namespace = params.namespace;
  if (params.folder !== undefined) patch.folder = params.folder;
  if (params.particle !== undefined) patch.particle = params.particle;
  if (params.visible !== undefined) patch.visible = params.visible;
  if (params.renderMode !== undefined) patch.render_mode = params.renderMode;
  if (params.renderSides !== undefined) patch.render_sides = params.renderSides;
  if (params.pbrChannel !== undefined) patch.pbr_channel = params.pbrChannel;
  if (params.group !== undefined) patch.group = params.group;
  if (params.frameTime !== undefined) patch.frame_time = params.frameTime;
  if (params.frameOrderType !== undefined) patch.frame_order_type = params.frameOrderType;
  if (params.frameOrder !== undefined) patch.frame_order = params.frameOrder;
  if (params.frameInterpolate !== undefined) patch.frame_interpolate = params.frameInterpolate;
  if (params.internal !== undefined) patch.internal = params.internal;
  if (params.keepSize !== undefined) patch.keep_size = params.keepSize;
  if (Object.keys(patch).length === 0) return;
  if (extendEntity(tex, patch)) return;
  Object.assign(tex, patch);
};

const normalizeTextureSize = (value?: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
};
