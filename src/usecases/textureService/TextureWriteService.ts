import type { ToolError } from '@ashfox/contracts/types/internal';
import type { TextureMeta } from '@ashfox/contracts/types/texture';
import type { EditorPort } from '../../ports/editor';
import type { ProjectSession, SessionState } from '../../session';
import { ok, fail, type UsecaseResult } from '../result';
import { resolveTextureTarget } from '../targetResolvers';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { resolveTextureSize } from '../../domain/textureUtils';
import { hashCanvasImage } from '../../shared/textureData';
import { withActiveAndRevision } from '../guards';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from '../crudChecks';
import {
  TEXTURE_ALREADY_EXISTS,
  TEXTURE_CONTENT_UNCHANGED,
  TEXTURE_CONTENT_UNCHANGED_FIX,
  TEXTURE_ID_EXISTS,
  TEXTURE_ID_OR_NAME_REQUIRED,
  TEXTURE_ID_OR_NAME_REQUIRED_FIX,
  TEXTURE_NAME_REQUIRED
} from '../../shared/messages';

export interface TextureWriteServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class TextureWriteService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: TextureWriteServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  importTexture(payload: {
    id?: string;
    name: string;
    image: CanvasImageSource;
    width?: number;
    height?: number;
    ifRevision?: string;
  } & TextureMeta): UsecaseResult<{ id: string; name: string }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        if (!payload.name) {
          return fail({ code: 'invalid_payload', message: TEXTURE_NAME_REQUIRED });
        }
        const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
        if (nameBlankErr) return fail(nameBlankErr);
        const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
        if (idBlankErr) return fail(idBlankErr);
        const snapshot = this.getSnapshot();
        const nameErr = ensureNameAvailable(snapshot.textures, payload.name, TEXTURE_ALREADY_EXISTS);
        if (nameErr) return fail(nameErr);
        const id = resolveEntityId(undefined, payload.id, 'tex');
        const idErr = ensureIdAvailable(snapshot.textures, id, TEXTURE_ID_EXISTS);
        if (idErr) return fail(idErr);
        const contentHash = hashCanvasImage(payload.image);
        const meta = pickTextureMeta(payload);
        const err = this.editor.importTexture({
          id,
          name: payload.name,
          image: payload.image,
          width: payload.width,
          height: payload.height,
          ...meta
        });
        if (err) return fail(err);
        const match = findTextureByIdOrName(this.editor.listTextures(), id, payload.name);
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
          ...meta
        });
        return ok({ id, name: payload.name });
      }
    );
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
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
        if (idBlankErr) return fail(idBlankErr);
        const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
        if (nameBlankErr) return fail(nameBlankErr);
        const newNameBlankErr = ensureNonBlankString(payload.newName, 'Texture newName');
        if (newNameBlankErr) return fail(newNameBlankErr);
        const resolved = resolveTextureTarget(snapshot.textures, payload.id, payload.name, {
          required: { message: TEXTURE_ID_OR_NAME_REQUIRED, fix: TEXTURE_ID_OR_NAME_REQUIRED_FIX }
        });
        if (resolved.error) return fail(resolved.error);
        const target = resolved.target!;
        const contentHash = hashCanvasImage(payload.image);
        const targetName = target.name;
        const targetId = resolveEntityId(target.id, payload.id, 'tex');
        const renameErr = ensureRenameAvailable(snapshot.textures, payload.newName, targetName, TEXTURE_ALREADY_EXISTS);
        if (renameErr) return fail(renameErr);
        const meta = pickTextureMeta(payload);
        const renaming = Boolean(payload.newName && payload.newName !== targetName);
        if (contentHash && target.contentHash && contentHash === target.contentHash && !renaming) {
          return fail({
            code: 'no_change',
            message: TEXTURE_CONTENT_UNCHANGED,
            fix: TEXTURE_CONTENT_UNCHANGED_FIX,
            details: {
              reason: 'content_hash_match',
              contentHash,
              previousHash: target.contentHash,
              targetName
            }
          });
        }
        const err = this.editor.updateTexture({
          id: targetId,
          name: targetName,
          newName: payload.newName,
          image: payload.image,
          width: payload.width,
          height: payload.height,
          ...meta
        });
        if (err) return fail(err);
        const effectiveName = payload.newName ?? targetName;
        const match = findTextureByIdOrName(this.editor.listTextures(), targetId, effectiveName);
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
          ...meta
        });
        return ok({ id: targetId, name: effectiveName });
      }
    );
  }

  deleteTexture(payload: { id?: string; name?: string; ifRevision?: string }): UsecaseResult<{ id: string; name: string }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
        if (idBlankErr) return fail(idBlankErr);
        const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
        if (nameBlankErr) return fail(nameBlankErr);
        const resolved = resolveTextureTarget(snapshot.textures, payload.id, payload.name);
        if (resolved.error) return fail(resolved.error);
        const target = resolved.target!;
        const err = this.editor.deleteTexture({ id: target.id ?? payload.id, name: target.name });
        if (err) return fail(err);
        this.session.removeTextures([target.name]);
        return ok({ id: target.id ?? payload.id ?? target.name, name: target.name });
      }
    );
  }
}

const findTextureByIdOrName = (
  textures: ReturnType<EditorPort['listTextures']>,
  id: string,
  name: string
) => textures.find((texture) => (texture.id && texture.id === id) || texture.name === name);

const pickTextureMeta = (
  payload: TextureMeta
): Pick<
  TextureMeta,
  | 'namespace'
  | 'folder'
  | 'particle'
  | 'visible'
  | 'renderMode'
  | 'renderSides'
  | 'pbrChannel'
  | 'group'
  | 'frameTime'
  | 'frameOrderType'
  | 'frameOrder'
  | 'frameInterpolate'
  | 'internal'
  | 'keepSize'
> => ({
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

