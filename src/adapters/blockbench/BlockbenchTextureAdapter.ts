import { ToolError } from '../../types';
import { Logger } from '../../logging';
import {
  ImportTextureCommand,
  ReadTextureCommand,
  TextureSource,
  TextureStat,
  UpdateTextureCommand,
  DeleteTextureCommand
} from '../../ports/editor';
import { TextureInstance } from '../../types/blockbench';
import { readGlobals, readTextureId, withUndo } from './blockbenchUtils';

export class BlockbenchTextureAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  importTexture(params: ImportTextureCommand): ToolError | null {
    if (!params.dataUri && !params.path) return { code: 'invalid_payload', message: 'dataUri or path is required' };
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Texture API not available' };
      }
      withUndo({ textures: true }, 'Import texture', () => {
        const tex = new TextureCtor({ name: params.name });
        if (params.id) tex.bbmcpId = params.id;
        let loadedViaData = false;
        if (params.dataUri) {
          if (typeof tex.fromDataURL === 'function') {
            tex.fromDataURL(params.dataUri);
            loadedViaData = true;
          } else if (typeof tex.loadFromDataURL === 'function') {
            tex.loadFromDataURL(params.dataUri);
            loadedViaData = true;
          } else {
            tex.source = params.dataUri;
          }
        } else if (params.path) {
          tex.source = params.path;
          tex.path = params.path;
        }
        if (typeof tex.add === 'function') {
          tex.add();
        }
        if (!loadedViaData) {
          tex.load?.();
        }
        tex.select?.();
      });
      this.log.info('texture imported', { name: params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture import failed';
      this.log.error('texture import error', { message });
      return { code: 'io_error', message };
    }
  }

  updateTexture(params: UpdateTextureCommand): ToolError | null {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Texture API not available' };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Texture not found: ${label}` };
      }
      if (params.id) target.bbmcpId = params.id;
      withUndo({ textures: true }, 'Update texture', () => {
        if (params.newName && params.newName !== target.name) {
          if (typeof target.rename === 'function') {
            target.rename(params.newName);
          } else {
            target.name = params.newName;
          }
        }
        const source = params.dataUri ?? params.path;
        if (source) {
          if (params.dataUri && typeof target.fromDataURL === 'function') {
            target.fromDataURL(params.dataUri);
          } else if (params.dataUri && typeof target.loadFromDataURL === 'function') {
            target.loadFromDataURL(params.dataUri);
          } else {
            target.source = source;
            if (params.path) target.path = params.path;
            target.load?.();
          }
        }
      });
      this.log.info('texture updated', { name: params.name, newName: params.newName });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture update failed';
      this.log.error('texture update error', { message });
      return { code: 'io_error', message };
    }
  }

  deleteTexture(params: DeleteTextureCommand): ToolError | null {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { code: 'not_implemented', message: 'Texture API not available' };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: `Texture not found: ${label}` };
      }
      withUndo({ textures: true }, 'Delete texture', () => {
        if (typeof target.remove === 'function') {
          target.remove();
          return;
        }
        if (typeof target.delete === 'function') {
          target.delete();
          return;
        }
        if (typeof target.dispose === 'function') {
          target.dispose();
          return;
        }
        const list = TextureCtor?.all;
        if (Array.isArray(list)) {
          const idx = list.indexOf(target);
          if (idx >= 0) list.splice(idx, 1);
        }
      });
      this.log.info('texture deleted', { name: target?.name ?? params.name });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture delete failed';
      this.log.error('texture delete error', { message });
      return { code: 'unknown', message };
    }
  }

  readTexture(params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } {
    try {
      const { Texture: TextureCtor } = readGlobals();
      if (typeof TextureCtor === 'undefined') {
        return { error: { code: 'not_implemented', message: 'Texture API not available' } };
      }
      const target = this.findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { error: { code: 'invalid_payload', message: `Texture not found: ${label}` } };
      }
      const width = target?.width ?? target?.img?.naturalWidth ?? target?.img?.width ?? 0;
      const height = target?.height ?? target?.img?.naturalHeight ?? target?.img?.height ?? 0;
      const path = target?.path ?? target?.source;
      const dataUri = getTextureDataUri(target);
      const image = (target?.img ?? target?.canvas) as CanvasImageSource | null;
      if (!dataUri && !image) {
        return { error: { code: 'not_implemented', message: 'Texture data unavailable' } };
      }
      return {
        result: {
          id: readTextureId(target),
          name: target?.name ?? target?.id ?? 'texture',
          width,
          height,
          path,
          dataUri: dataUri ?? undefined,
          image: image ?? undefined
        }
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'texture read failed';
      this.log.error('texture read error', { message });
      return { error: { code: 'unknown', message } };
    }
  }

  listTextures(): TextureStat[] {
    const { Texture: TextureCtor } = readGlobals();
    const list = Array.isArray(TextureCtor?.all) ? TextureCtor.all : [];
    return list.map((tex) => ({
      id: readTextureId(tex),
      name: tex?.name ?? tex?.id ?? 'texture',
      width: tex?.width ?? tex?.img?.naturalWidth ?? 0,
      height: tex?.height ?? tex?.img?.naturalHeight ?? 0,
      path: tex?.path ?? tex?.source
    }));
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

const getTextureDataUri = (tex: TextureInstance): string | null => {
  if (!tex) return null;
  if (typeof tex.getDataUrl === 'function') {
    return tex.getDataUrl();
  }
  if (typeof tex.getBase64 === 'function') {
    return tex.getBase64();
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
