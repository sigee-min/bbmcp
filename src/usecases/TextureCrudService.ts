import type { ToolError, ReadTexturePayload, ReadTextureResult } from '../types';
import type { TextureMeta } from '../types/texture';
import type { EditorPort, TextureSource } from '../ports/editor';
import type { TmpStorePort } from '../ports/tmpStore';
import type { ProjectSession, SessionState } from '../session';
import { ok, fail, UsecaseResult } from './result';
import { ensureActiveAndRevision, ensureActiveOnly } from './guards';
import { createId } from '../services/id';
import { resolveTextureOrError } from '../services/targetGuards';
import { ensureNonBlankString } from '../services/validation';
import {
  hashCanvasImage,
  estimateDataUriByteLength,
  normalizeTextureDataUri,
  parseDataUriMimeType,
  resolveTextureSize
} from '../services/textureUtils';
import {
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_CONTENT_UNCHANGED,
  TEXTURE_CONTENT_UNCHANGED_FIX,
  TEXTURE_DATA_UNAVAILABLE,
  TEXTURE_ID_EXISTS,
  TEXTURE_ID_OR_NAME_REQUIRED,
  TEXTURE_ID_OR_NAME_REQUIRED_FIX,
  TEXTURE_NAME_REQUIRED,
  TMP_STORE_UNAVAILABLE
} from '../shared/messages';

export interface TextureCrudServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  tmpStore?: TmpStorePort;
}

export class TextureCrudService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
  private readonly tmpStore?: TmpStorePort;

  constructor(deps: TextureCrudServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
    this.tmpStore = deps.tmpStore;
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    if (!payload.name) {
      return fail({ code: 'invalid_payload', message: TEXTURE_NAME_REQUIRED });
    }
    const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
    if (nameBlankErr) return fail(nameBlankErr);
    const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
    if (idBlankErr) return fail(idBlankErr);
    const snapshot = this.getSnapshot();
    const nameConflict = snapshot.textures.some((t) => t.name === payload.name);
    if (nameConflict) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.name) });
    }
    const id = payload.id ?? createId('tex');
    const idConflict = snapshot.textures.some((t) => t.id && t.id === id);
    if (idConflict) {
      return fail({ code: 'invalid_payload', message: TEXTURE_ID_EXISTS(id) });
    }
    const contentHash = hashCanvasImage(payload.image);
    const err = this.editor.importTexture({
      id,
      name: payload.name,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === id) || t.name === payload.name);
    const resolvedSize = resolveTextureSize(
      { width: match?.width, height: match?.height },
      { width: payload.width, height: payload.height }
    );
    this.session.addTexture({
      id,
      name: payload.name,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id, name: payload.name });
  }

  updateTexture(payload: {
    id?: string;
    name?: string;
    newName?: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
    if (idBlankErr) return fail(idBlankErr);
    const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
    if (nameBlankErr) return fail(nameBlankErr);
    const newNameBlankErr = ensureNonBlankString(payload.newName, 'Texture newName');
    if (newNameBlankErr) return fail(newNameBlankErr);
    const resolved = resolveTextureOrError(snapshot.textures, payload.id, payload.name, {
      required: { message: TEXTURE_ID_OR_NAME_REQUIRED, fix: TEXTURE_ID_OR_NAME_REQUIRED_FIX }
    });
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const contentHash = hashCanvasImage(payload.image);
    const targetName = target.name;
    const targetId = target.id ?? payload.id ?? createId('tex');
    if (payload.newName && payload.newName !== targetName) {
      const conflict = snapshot.textures.some((t) => t.name === payload.newName && t.name !== targetName);
      if (conflict) {
        return fail({ code: 'invalid_payload', message: TEXTURE_ALREADY_EXISTS(payload.newName) });
      }
    }
    const renaming = Boolean(payload.newName && payload.newName !== targetName);
    if (contentHash && target.contentHash && contentHash === target.contentHash && !renaming) {
      return fail({
        code: 'no_change',
        message: TEXTURE_CONTENT_UNCHANGED,
        fix: TEXTURE_CONTENT_UNCHANGED_FIX
      });
    }
    const err = this.editor.updateTexture({
      id: targetId,
      name: targetName,
      newName: payload.newName,
      image: payload.image,
      width: payload.width,
      height: payload.height,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    if (err) return fail(err);
    const effectiveName = payload.newName ?? targetName;
    const match = this.editor
      .listTextures()
      .find((t) => (t.id && t.id === targetId) || t.name === effectiveName);
    const resolvedSize = resolveTextureSize(
      { width: match?.width, height: match?.height },
      { width: payload.width, height: payload.height },
      { width: target.width, height: target.height }
    );
    this.session.updateTexture(targetName, {
      id: targetId,
      newName: payload.newName,
      width: resolvedSize.width,
      height: resolvedSize.height,
      contentHash: contentHash ?? undefined,
      namespace: payload.namespace,
      folder: payload.folder,
      particle: payload.particle,
      visible: payload.visible,
      renderMode: payload.renderMode,
      renderSides: payload.renderSides,
      pbrChannel: payload.pbrChannel,
      group: payload.group,
      frameTime: payload.frameTime,
      frameOrderType: payload.frameOrderType,
      frameOrder: payload.frameOrder,
      frameInterpolate: payload.frameInterpolate,
      internal: payload.internal,
      keepSize: payload.keepSize
    });
    return ok({ id: targetId, name: effectiveName });
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    const guardErr = ensureActiveAndRevision(this.ensureActive, this.ensureRevisionMatch, payload.ifRevision);
    if (guardErr) return fail(guardErr);
    const snapshot = this.getSnapshot();
    const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
    if (idBlankErr) return fail(idBlankErr);
    const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
    if (nameBlankErr) return fail(nameBlankErr);
    const resolved = resolveTextureOrError(snapshot.textures, payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const err = this.editor.deleteTexture({ id: target.id ?? payload.id, name: target.name });
    if (err) return fail(err);
    this.session.removeTextures([target.name]);
    return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    const activeErr = ensureActiveOnly(this.ensureActive);
    if (activeErr) return fail(activeErr);
    const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
    if (idBlankErr) return fail(idBlankErr);
    const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
    if (nameBlankErr) return fail(nameBlankErr);
    const resolved = resolveTextureOrError(this.editor.listTextures(), payload.id, payload.name);
    if (resolved.error) return fail(resolved.error);
    const target = resolved.target!;
    const targetId = target.id ?? undefined;
    const res = this.editor.readTexture({
      id: payload.id ?? targetId,
      name: payload.name ?? target.name
    });
    if (res.error) return fail(res.error);
    return ok(res.result!);
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    const { saveToTmp, tmpName, tmpPrefix, ...query } = payload;
    const sourceRes = this.readTexture(query);
    if (!sourceRes.ok) return sourceRes;
    const source = sourceRes.value;
    const dataUri = normalizeTextureDataUri(source.dataUri);
    if (!dataUri) {
      return fail({ code: 'not_implemented', message: TEXTURE_DATA_UNAVAILABLE });
    }
    const mimeType = parseDataUriMimeType(dataUri) ?? 'image/png';
    const byteLength = estimateDataUriByteLength(dataUri) ?? undefined;
    const hash = hashCanvasImage(source.image) ?? undefined;
    const result: ReadTextureResult = {
      texture: {
        id: source.id,
        name: source.name,
        mimeType,
        dataUri,
        width: source.width,
        height: source.height,
        byteLength,
        hash
      }
    };
    if (!saveToTmp) return ok(result);
    if (!this.tmpStore) {
      return fail({ code: 'not_implemented', message: TMP_STORE_UNAVAILABLE });
    }
    const saved = this.tmpStore.saveDataUri(dataUri, {
      nameHint: tmpName ?? source.name ?? 'texture',
      prefix: tmpPrefix ?? 'texture'
    });
    if (!saved.ok) return fail(saved.error);
    return ok({
      ...result,
      saved: {
        texture: {
          path: saved.data.path,
          mime: mimeType,
          byteLength: saved.data.byteLength,
          width: source.width,
          height: source.height
        }
      }
    });
  }
}
