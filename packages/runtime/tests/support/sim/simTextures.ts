import type {
  TextureStat,
  TextureSource,
  ImportTextureCommand,
  UpdateTextureCommand,
  DeleteTextureCommand,
  ReadTextureCommand
} from '../../../src/ports/editor';
import type { TextureInstance } from '../../../src/types/blockbench';
import type { ToolError } from '../../../src/types';
import type { BlockbenchSimState, SimCounters } from './simTypes';
import { DEFAULT_TEXTURE_SIZE } from './simConstants';
import { normalizeSize, error } from './simUtils';

export type SimTextureContext = {
  state: BlockbenchSimState;
  counters: SimCounters;
  isSingleTexture: () => boolean;
  isPerTextureUvSize: () => boolean;
  applyProjectTextureResolution: (width: number, height: number, modifyUv?: boolean) => ToolError | null;
};

export const createTextureOps = (ctx: SimTextureContext) => {
  const listTextures = (): TextureStat[] =>
    ctx.state.textures.map((tex) => ({
      id: tex.id ?? null,
      name: tex.name ?? 'texture',
      ...resolveTextureSize(tex.width, tex.height, true),
      path: tex.path
    }));

  const normalizeTexture = (tex: Pick<TextureInstance, 'id' | 'name' | 'width' | 'height' | 'path'>): TextureInstance => {
    const id = tex.id ?? `tex-${ctx.counters.nextTextureId++}`;
    const name = tex.name ?? id;
    const size = resolveTextureSize(tex.width, tex.height, true);
    return { id, name, width: size.width, height: size.height, path: tex.path };
  };

  const resolveTextureSize = (
    width?: number,
    height?: number,
    skipProjectSync = false,
    fallback?: TextureInstance
  ): { width: number; height: number } => {
    const resolution = ctx.state.project.textureResolution;
    const baseWidth = normalizeSize(width) ?? fallback?.width ?? resolution?.width ?? DEFAULT_TEXTURE_SIZE;
    const baseHeight = normalizeSize(height) ?? fallback?.height ?? resolution?.height ?? DEFAULT_TEXTURE_SIZE;
    if (!ctx.isPerTextureUvSize()) {
      const nextWidth = normalizeSize(width) ?? baseWidth;
      const nextHeight = normalizeSize(height) ?? baseHeight;
      if (!skipProjectSync) {
        ctx.applyProjectTextureResolution(nextWidth, nextHeight, false);
      }
      const projectResolution = ctx.state.project.textureResolution;
      return {
        width: projectResolution?.width ?? nextWidth,
        height: projectResolution?.height ?? nextHeight
      };
    }
    return { width: baseWidth, height: baseHeight };
  };

  const importTexture = (params: ImportTextureCommand): ToolError | null => {
    const name = params.name ?? `texture_${ctx.counters.nextTextureId}`;
    const existingIndex = ctx.state.textures.findIndex(
      (tex) => (params.id && tex.id === params.id) || tex.name === name
    );
    const existing = existingIndex >= 0 ? ctx.state.textures[existingIndex] : null;
    const id = params.id ?? existing?.id ?? `tex-${ctx.counters.nextTextureId++}`;
    const size = resolveTextureSize(params.width, params.height);
    const next: TextureInstance = { id, name, width: size.width, height: size.height };
    if (existingIndex >= 0 && existing) {
      ctx.state.textures[existingIndex] = { ...existing, ...next };
      if (existing.id !== next.id || existing.name !== next.name) {
        replaceTextureRefs({ id: existing.id, name: existing.name }, next);
      }
      syncTexturesToProjectResolution();
      return null;
    }
    if (ctx.isSingleTexture()) {
      const previous = [...ctx.state.textures];
      ctx.state.textures = [next];
      if (previous.length > 0) {
        replaceTextureRefsForTextures(previous, next);
      }
    } else {
      ctx.state.textures.push(next);
    }
    syncTexturesToProjectResolution();
    return null;
  };

  const updateTexture = (params: UpdateTextureCommand): ToolError | null => {
    const target = findTexture(params.id, params.name ?? params.newName);
    if (!target) {
      return error('invalid_payload', `Texture not found: ${params.name ?? params.id ?? 'unknown'}`);
    }
    const prevName = target.name ?? undefined;
    const size = resolveTextureSize(params.width, params.height, false, target);
    target.name = params.newName ?? target.name;
    target.width = size.width;
    target.height = size.height;
    if (params.newName && prevName && prevName !== params.newName) {
      replaceTextureRefs({ name: prevName }, target);
    }
    syncTexturesToProjectResolution();
    return null;
  };

  const deleteTexture = (params: DeleteTextureCommand): ToolError | null => {
    const removed = ctx.state.textures.filter(
      (tex) => (params.id && tex.id === params.id) || (params.name && tex.name === params.name)
    );
    ctx.state.textures = ctx.state.textures.filter(
      (tex) => !((params.id && tex.id === params.id) || (params.name && tex.name === params.name))
    );
    if (removed.length === 0) {
      return error('invalid_payload', `Texture not found: ${params.name ?? params.id ?? 'unknown'}`);
    }
    replaceTextureRefsForTextures(removed, null);
    return null;
  };

  const readTexture = (params: ReadTextureCommand): { result?: TextureSource; error?: ToolError } => {
    const target = findTexture(params.id, params.name);
    if (!target) {
      return { error: error('invalid_payload', `Texture not found: ${params.name ?? params.id ?? 'unknown'}`) };
    }
    const size = resolveTextureSize(target.width, target.height, true);
    return {
      result: {
        id: target.id ?? undefined,
        name: target.name ?? 'texture',
        width: size.width,
        height: size.height,
        path: target.path,
        image: { width: size.width, height: size.height } as CanvasImageSource
      }
    };
  };

  const findTexture = (id?: string, name?: string): TextureInstance | null =>
    ctx.state.textures.find((tex) => (id && tex.id === id) || (name && tex.name === name)) ?? null;

  const replaceTextureRefs = (match: { id?: string | null; name?: string | null }, next?: TextureInstance | null): void => {
    const refs = new Set<string>();
    if (match.id) refs.add(String(match.id));
    if (match.name) refs.add(String(match.name));
    if (refs.size === 0) return;
    const nextRef = next?.id ?? next?.name ?? null;
    ctx.state.cubes.forEach((cube) => {
      const faces = cube.faces ?? {};
      Object.values(faces).forEach((face) => {
        const current = face?.texture;
        if (current === false || current === undefined || current === null) return;
        const currentRef = typeof current === 'string' ? current : String(current);
        if (!refs.has(currentRef)) return;
        face.texture = nextRef ?? false;
      });
    });
  };

  const replaceTextureRefsForTextures = (textures: TextureInstance[], next?: TextureInstance | null): void => {
    const refs = new Set<string>();
    textures.forEach((tex) => {
      if (tex.id) refs.add(String(tex.id));
      if (tex.name) refs.add(String(tex.name));
    });
    if (refs.size === 0) return;
    const nextRef = next?.id ?? next?.name ?? null;
    ctx.state.cubes.forEach((cube) => {
      const faces = cube.faces ?? {};
      Object.values(faces).forEach((face) => {
        const current = face?.texture;
        if (current === false || current === undefined || current === null) return;
        const currentRef = typeof current === 'string' ? current : String(current);
        if (!refs.has(currentRef)) return;
        face.texture = nextRef ?? false;
      });
    });
  };

  const syncTexturesToProjectResolution = (): void => {
    if (ctx.isPerTextureUvSize()) return;
    const resolution = ctx.state.project.textureResolution;
    if (!resolution) return;
    ctx.state.textures.forEach((tex) => {
      tex.width = resolution.width;
      tex.height = resolution.height;
    });
  };

  return {
    listTextures,
    normalizeTexture,
    resolveTextureSize,
    importTexture,
    updateTexture,
    deleteTexture,
    readTexture,
    findTexture,
    replaceTextureRefs,
    replaceTextureRefsForTextures,
    syncTexturesToProjectResolution
  };
};
