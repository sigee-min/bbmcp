import { ToolError } from '../../types';
import { errorMessage, Logger } from '../../logging';
import { toolError } from '../../services/toolResponse';
import {
  ImportTextureCommand,
  ReadTextureCommand,
  TextureSource,
  TextureStat,
  UpdateTextureCommand,
  DeleteTextureCommand
} from '../../ports/editor';
import { TextureInstance } from '../../types/blockbench';
import {
  extendEntity,
  readGlobals,
  readTextureId,
  readTextureSize,
  removeEntity,
  renameEntity,
  withUndo
} from './blockbenchUtils';
import {
  ADAPTER_TEXTURE_API_UNAVAILABLE,
  ADAPTER_TEXTURE_CANVAS_UNAVAILABLE,
  ADAPTER_TEXTURE_DATA_UNAVAILABLE,
  TEXTURE_NOT_FOUND
} from '../../shared/messages';

export class BlockbenchTextureAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  importTexture(params: ImportTextureCommand): ToolError | null {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_TEXTURE_API_UNAVAILABLE };
      }
      let imageMissing = false;
      withUndo({ textures: true }, 'Import texture', () => {
        const tex = new TextureCtor({ name: params.name, width: params.width, height: params.height });
        if (params.id) tex.bbmcpId = params.id;
        applyTextureDefaults(tex);
        if (typeof tex.add === 'function') {
          tex.add();
        }
        applyTextureDimensions(tex, params.width, params.height);
        applyTextureMeta(tex, params);
        if (!applyTextureImage(tex, params.image)) {
          imageMissing = true;
          return;
        }
        if (applyTextureDimensions(tex, params.width, params.height)) {
          if (!applyTextureImage(tex, params.image)) {
            imageMissing = true;
            return;
          }
        }
        finalizeTextureChange(tex);
        tex.select?.();
      });
      if (imageMissing) {
        return { code: 'not_implemented', message: ADAPTER_TEXTURE_CANVAS_UNAVAILABLE };
      }
      this.log.info('texture imported', { name: params.name });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'texture import failed');
      this.log.error('texture import error', { message });
      return { code: 'io_error', message };
    }
  }

  updateTexture(params: UpdateTextureCommand): ToolError | null {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_TEXTURE_API_UNAVAILABLE };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) };
      }
      if (params.id) target.bbmcpId = params.id;
      let imageMissing = false;
      withUndo({ textures: true }, 'Update texture', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        applyTextureDefaults(target);
        applyTextureDimensions(target, params.width, params.height);
        applyTextureMeta(target, params);
        if (!applyTextureImage(target, params.image)) {
          imageMissing = true;
          return;
        }
        if (applyTextureDimensions(target, params.width, params.height)) {
          if (!applyTextureImage(target, params.image)) {
            imageMissing = true;
            return;
          }
        }
        finalizeTextureChange(target);
      });
      if (imageMissing) {
        return { code: 'not_implemented', message: ADAPTER_TEXTURE_CANVAS_UNAVAILABLE };
      }
      this.log.info('texture updated', { name: params.name, newName: params.newName });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'texture update failed');
      this.log.error('texture update error', { message });
      return { code: 'io_error', message };
    }
  }

  deleteTexture(params: DeleteTextureCommand): ToolError | null {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: ADAPTER_TEXTURE_API_UNAVAILABLE };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) };
      }
      withUndo({ textures: true }, 'Delete texture', () => {
        if (removeEntity(target)) return;
        const list = TextureCtor?.all;
        if (Array.isArray(list)) {
          const idx = list.indexOf(target);
          if (idx >= 0) list.splice(idx, 1);
        }
      });
      this.log.info('texture deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'texture delete failed');
      this.log.error('texture delete error', { message });
      return toolError('unknown', message, { reason: 'adapter_exception', context: 'texture_delete' });
    }
  }

  readTexture(params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { error: { code: 'not_implemented', message: ADAPTER_TEXTURE_API_UNAVAILABLE } };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { error: { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) } };
      }
      const size = readTextureSize(target);
      const width = size.width;
      const height = size.height;
      const path = target?.path ?? target?.source;
      const dataUri = getTextureDataUri(target);
      const image = (target?.img ?? target?.canvas) as CanvasImageSource | null;
      if (!dataUri && !image) {
        return { error: { code: 'not_implemented', message: ADAPTER_TEXTURE_DATA_UNAVAILABLE } };
      }
      return {
        result: {
          id: readTextureId(target) ?? undefined,
          name: target?.name ?? target?.id ?? 'texture',
          width,
          height,
          path,
          dataUri: dataUri ?? undefined,
          image: image ?? undefined
        }
      };
    } catch (err) {
      const message = errorMessage(err, 'texture read failed');
      this.log.error('texture read error', { message });
      return { error: toolError('unknown', message, { reason: 'adapter_exception', context: 'texture_read' }) };
    }
  }

  listTextures(): TextureStat[] {
    const { Texture: TextureCtor } = readGlobals();
    const list = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
    return list.map((tex) => {
      const size = readTextureSize(tex);
      return {
        id: readTextureId(tex),
        name: tex?.name ?? tex?.id ?? 'texture',
        width: size.width ?? 0,
        height: size.height ?? 0,
        path: tex?.path ?? tex?.source
      };
    });
  }

  private findTextureRef(name?: string, id?: string): TextureInstance | null {
    const { Texture: TextureCtor } = readGlobals();
    const textures = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
    if (id) {
      const byId = textures.find((tex) => readTextureId(tex) === id);
      if (byId) return byId;
    }
    if (name) return textures.find((tex) => tex?.name === name || tex?.id === name) ?? null;
    return null;
  }
}

const finalizeTextureChange = (tex: TextureInstance): void => {
  if (typeof tex.updateChangesAfterEdit === 'function') {
    tex.updateChangesAfterEdit();
    return;
  }
  if (typeof tex.updateLayerChanges === 'function') {
    tex.updateLayerChanges(true);
  }
};

const applyTextureDefaults = (tex: TextureInstance): void => {
  if (!tex) return;
  if (tex.internal === undefined) tex.internal = true;
  if (tex.keep_size === undefined) tex.keep_size = true;
};

const applyTextureDimensions = (tex: TextureInstance, width?: number, height?: number): boolean => {
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

const applyTextureImage = (tex: TextureInstance, source: CanvasImageSource): boolean => {
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

const applyTextureMeta = (
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

const getTextureDataUri = (tex: TextureInstance): string | null => {
  if (!tex) return null;
  if (typeof tex.getDataUrl === 'function') {
    return tex.getDataUrl();
  }
  if (typeof tex.getBase64 === 'function') {
    const base64 = tex.getBase64();
    return base64 ? wrapBase64Png(base64) : null;
  }
  if (typeof tex.toDataURL === 'function') {
    return tex.toDataURL('image/png');
  }
  const canvas = tex.canvas;
  if (canvas && typeof canvas.toDataURL === 'function') {
    return canvas.toDataURL('image/png');
  }
  const img = tex.img;
  const doc = readGlobals().document;
  if (img && doc?.createElement) {
    const temp = doc.createElement('canvas') as HTMLCanvasElement | null;
    if (!temp) return null;
    const width = img.naturalWidth ?? img.width ?? 0;
    const height = img.naturalHeight ?? img.height ?? 0;
    if (!width || !height) return null;
    temp.width = width;
    temp.height = height;
    const ctx = temp.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return temp.toDataURL('image/png');
  }
  return null;
};

const wrapBase64Png = (value: string): string => {
  if (!value) return value;
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
};
