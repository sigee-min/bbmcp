import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import type {
  DeleteTextureCommand,
  ImportTextureCommand,
  ReadTextureCommand,
  TextureSource,
  TextureStat,
  UpdateTextureCommand
} from '../../../ports/editor';
import type { ToolError } from '@ashfox/contracts/types/internal';
import type { PreviewItem, TextureConstructor, TextureInstance } from '../../../types/blockbench';
import { readGlobals, readTextureId, readTextureSize, removeEntity, renameEntity, withUndo } from '../blockbenchUtils';
import { withMappedAdapterError } from '../adapterErrors';
import { getTextureApi } from '../blockbenchAdapterUtils';
import {
  ADAPTER_TEXTURE_CANVAS_UNAVAILABLE,
  ADAPTER_TEXTURE_DATA_UNAVAILABLE,
  TEXTURE_NOT_FOUND
} from '../../../shared/messages';
import { getTextureDataUri } from './textureData';
import {
  applyTextureDefaults,
  applyTextureDimensions,
  applyTextureImage,
  applyTextureMeta,
  finalizeTextureChange
} from './textureOps';
import { findTextureRef, listTextureStats } from './textureLookup';

type TextureWriteCommand = ImportTextureCommand | UpdateTextureCommand;

export const runImportTexture = (log: Logger, params: ImportTextureCommand): ToolError | null => {
  return withMappedAdapterError(
    log,
    {
      context: 'texture_import',
      fallbackMessage: 'texture import failed',
      logLabel: 'texture import error',
      normalizeMessage: false
    },
    () => {
      const api = getTextureApi();
      if ('error' in api) return api.error;
      const TextureCtor = api.TextureCtor as TextureConstructor;
      let imageMissing = false;
      withUndo({ textures: true }, 'Import texture', () => {
        const tex = new TextureCtor({ name: params.name, width: params.width, height: params.height });
        if (params.id) tex.ashfoxId = params.id;
        if (typeof tex.add === 'function') {
          tex.add();
        }
        if (!applyTextureContent(tex, params)) {
          imageMissing = true;
          return;
        }
        tex.select?.();
      });
      if (imageMissing) {
        return { code: 'invalid_state', message: ADAPTER_TEXTURE_CANVAS_UNAVAILABLE };
      }
      refreshTextureViewport(log);
      log.info('texture imported', { name: params.name });
      return null;
    },
    (error) => ({ code: 'io_error', message: error.message })
  );
};

export const runUpdateTexture = (log: Logger, params: UpdateTextureCommand): ToolError | null => {
  return withMappedAdapterError(
    log,
    {
      context: 'texture_update',
      fallbackMessage: 'texture update failed',
      logLabel: 'texture update error',
      normalizeMessage: false
    },
    () => {
      const api = getTextureApi();
      if ('error' in api) return api.error;
      const target = findTextureRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: TEXTURE_NOT_FOUND(label) };
      }
      if (params.id) target.ashfoxId = params.id;
      let imageMissing = false;
      withUndo({ textures: true }, 'Update texture', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        if (!applyTextureContent(target, params)) imageMissing = true;
      });
      if (imageMissing) {
        return { code: 'invalid_state', message: ADAPTER_TEXTURE_CANVAS_UNAVAILABLE };
      }
      refreshTextureViewport(log);
      log.info('texture updated', { name: params.name, newName: params.newName });
      return null;
    },
    (error) => ({ code: 'io_error', message: error.message })
  );
};

export const runDeleteTexture = (log: Logger, params: DeleteTextureCommand): ToolError | null => {
  return withMappedAdapterError(
    log,
    {
      context: 'texture_delete',
      fallbackMessage: 'texture delete failed',
      logLabel: 'texture delete error'
    },
    () => {
      const api = getTextureApi();
      if ('error' in api) return api.error;
      const TextureCtor = api.TextureCtor as TextureConstructor;
      const target = findTextureRef(params.name, params.id);
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
      refreshTextureViewport(log);
      log.info('texture deleted', { name: target?.name ?? params.name });
      return null;
    },
    (error) => error
  );
};

export const runReadTexture = (
  log: Logger,
  params: ReadTextureCommand
): { result?: TextureSource; error?: ToolError } => {
  return withMappedAdapterError(
    log,
    {
      context: 'texture_read',
      fallbackMessage: 'texture read failed',
      logLabel: 'texture read error'
    },
    () => {
      const api = getTextureApi();
      if ('error' in api) return { error: api.error };
      const target = findTextureRef(params.name, params.id);
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
        return { error: { code: 'invalid_state', message: ADAPTER_TEXTURE_DATA_UNAVAILABLE } };
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
    },
    (error) => ({ error })
  );
};

export const runListTextures = (): TextureStat[] => listTextureStats();

const applyTextureContent = (
  tex: TextureInstance,
  params: TextureWriteCommand
): boolean => {
  applyTextureDefaults(tex);
  applyTextureDimensions(tex, params.width, params.height);
  applyTextureMeta(tex, params);
  if (!applyTextureImage(tex, params.image)) return false;
  if (applyTextureDimensions(tex, params.width, params.height) && !applyTextureImage(tex, params.image)) {
    return false;
  }
  finalizeTextureChange(tex);
  return true;
};

const collectPreviewCandidates = (registry: { selected?: PreviewItem | null; all?: PreviewItem[] } | undefined): PreviewItem[] =>
  [registry?.selected, ...(registry?.all ?? [])].filter((entry): entry is PreviewItem => Boolean(entry));

const refreshTextureViewport = (log: Logger): void => {
  try {
    const globals = readGlobals();
    const candidates = collectPreviewCandidates(globals.Preview);
    const rendered = new Set<PreviewItem>();
    for (const preview of candidates) {
      if (rendered.has(preview)) continue;
      if (typeof preview.render === 'function') {
        preview.render();
        rendered.add(preview);
      }
    }
    if (rendered.size === 0) {
      globals.Blockbench?.dispatchEvent?.('ashfox:texture_changed', {
        source: 'texture_commands'
      });
    }
  } catch (err) {
    log.warn('texture viewport refresh failed', { message: errorMessage(err, 'texture viewport refresh failed') });
  }
};
