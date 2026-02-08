import type { ToolError, ReadTexturePayload, ReadTextureResult } from '@ashfox/contracts/types/internal';
import type { EditorPort, TextureSource } from '../../ports/editor';
import type { TmpStorePort } from '../../ports/tmpStore';
import { ok, fail, type UsecaseResult } from '../result';
import { resolveTextureTarget } from '../targetResolvers';
import { ensureNonBlankString } from '../../shared/payloadValidation';
import { withActiveOnly } from '../guards';
import {
  TEXTURE_ID_OR_NAME_REQUIRED,
  TEXTURE_ID_OR_NAME_REQUIRED_FIX,
  TMP_STORE_UNAVAILABLE
} from '../../shared/messages';
import {
  prepareTextureReadImage,
  withSavedTextureResult,
  type PreparedTextureReadImage
} from './textureReadImage';

export interface TextureReadServiceDeps {
  editor: EditorPort;
  ensureActive: () => ToolError | null;
  tmpStore?: TmpStorePort;
}

export class TextureReadService {
  private readonly editor: EditorPort;
  private readonly ensureActive: () => ToolError | null;
  private readonly tmpStore?: TmpStorePort;

  constructor(deps: TextureReadServiceDeps) {
    this.editor = deps.editor;
    this.ensureActive = deps.ensureActive;
    this.tmpStore = deps.tmpStore;
  }

  readTexture(payload: { id?: string; name?: string }): UsecaseResult<TextureSource> {
    return withActiveOnly(this.ensureActive, () => {
      const idBlankErr = ensureNonBlankString(payload.id, 'Texture id');
      if (idBlankErr) return fail(idBlankErr);
      const nameBlankErr = ensureNonBlankString(payload.name, 'Texture name');
      if (nameBlankErr) return fail(nameBlankErr);
      const resolved = resolveTextureTarget(this.editor.listTextures(), payload.id, payload.name, {
        required: { message: TEXTURE_ID_OR_NAME_REQUIRED, fix: TEXTURE_ID_OR_NAME_REQUIRED_FIX }
      });
      if (resolved.error) return fail(resolved.error);
      const target = resolved.target!;
      const targetId = target.id ?? undefined;
      const res = this.editor.readTexture({
        id: payload.id ?? targetId,
        name: payload.name ?? target.name
      });
      if (res.error) return fail(res.error);
      return ok(res.result!);
    });
  }

  readTextureImage(payload: ReadTexturePayload): UsecaseResult<ReadTextureResult> {
    const { saveToTmp, tmpName, tmpPrefix, ...query } = payload;
    const sourceRes = this.readTexture(query);
    if (!sourceRes.ok) return sourceRes;
    const preparedRes = prepareTextureReadImage(sourceRes.value);
    if (!preparedRes.ok) return preparedRes;
    if (!saveToTmp) return ok(preparedRes.value.result);
    if (!this.tmpStore) {
      return fail({ code: 'not_implemented', message: TMP_STORE_UNAVAILABLE });
    }
    const savedRes = this.savePreparedTexture(preparedRes.value, {
      nameHint: tmpName ?? sourceRes.value.name ?? 'texture',
      prefix: tmpPrefix ?? 'texture'
    });
    if (!savedRes.ok) return savedRes;
    return ok(savedRes.value);
  }

  private savePreparedTexture(
    prepared: PreparedTextureReadImage,
    options: { nameHint: string; prefix: string }
  ): UsecaseResult<ReadTextureResult> {
    if (!this.tmpStore) {
      return fail({ code: 'not_implemented', message: TMP_STORE_UNAVAILABLE });
    }
    const saved = this.tmpStore.saveDataUri(prepared.dataUri, options);
    if (!saved.ok) return fail(saved.error);
    return ok(withSavedTextureResult(prepared, { path: saved.data.path, byteLength: saved.data.byteLength }));
  }
}

