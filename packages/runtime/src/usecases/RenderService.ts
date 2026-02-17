import type { RenderPreviewPayload, RenderPreviewResult, ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../ports/editor';
import type { TmpStorePort } from '../ports/tmpStore';
import { ok, fail, UsecaseResult } from './result';
import { withActiveOnly } from './guards';
import {
  PREVIEW_FRAME_DATA_UNAVAILABLE,
  PREVIEW_FRAMES_UNAVAILABLE,
  PREVIEW_IMAGE_DATA_UNAVAILABLE,
  PREVIEW_UNSUPPORTED_NO_RENDER,
  TMP_STORE_UNAVAILABLE
} from '../shared/messages';

export interface RenderServiceDeps {
  editor: EditorPort;
  tmpStore?: TmpStorePort;
  ensureActive: () => ToolError | null;
  allowRenderPreview?: boolean;
}

export class RenderService {
  private readonly editor: EditorPort;
  private readonly tmpStore?: TmpStorePort;
  private readonly ensureActive: () => ToolError | null;
  private readonly allowRenderPreview: boolean;

  constructor(deps: RenderServiceDeps) {
    this.editor = deps.editor;
    this.tmpStore = deps.tmpStore;
    this.ensureActive = deps.ensureActive;
    this.allowRenderPreview = deps.allowRenderPreview !== false;
  }

  private ensureTmpStore(): ToolError | null {
    if (!this.tmpStore) {
      return { code: 'invalid_state', message: TMP_STORE_UNAVAILABLE };
    }
    return null;
  }

  private savePreviewDataUri(
    dataUri: string | undefined,
    missingMessage: string,
    options: { nameHint: string; prefix: string }
  ): UsecaseResult<{ path: string; byteLength: number }> {
    if (!dataUri) {
      return fail({ code: 'invalid_state', message: missingMessage });
    }
    const tmpErr = this.ensureTmpStore();
    if (tmpErr) return fail(tmpErr);
    const saved = this.tmpStore!.saveDataUri(dataUri, options);
    if (!saved.ok) return fail(saved.error);
    return ok({ path: saved.data.path, byteLength: saved.data.byteLength });
  }

  renderPreview(payload: RenderPreviewPayload): UsecaseResult<RenderPreviewResult> {
    if (!this.allowRenderPreview) {
      return fail({ code: 'invalid_state', message: PREVIEW_UNSUPPORTED_NO_RENDER });
    }
    return withActiveOnly(this.ensureActive, () => {
      const { saveToTmp, tmpName, tmpPrefix, ...previewPayload } = payload;
      const res = this.editor.renderPreview(previewPayload);
      if (res.error) return fail(res.error);
      const result = res.result!;
      if (!saveToTmp) return ok(result);
      if (result.kind === 'single') {
        const image = result.image;
        if (!image) {
          return fail({ code: 'invalid_state', message: PREVIEW_IMAGE_DATA_UNAVAILABLE });
        }
        const saved = this.savePreviewDataUri(image?.dataUri, PREVIEW_IMAGE_DATA_UNAVAILABLE, {
          nameHint: tmpName ?? 'preview',
          prefix: tmpPrefix ?? 'preview'
        });
        if (!saved.ok) return fail(saved.error);
        return ok({
          ...result,
          saved: {
            image: {
              path: saved.value.path,
              mime: image.mime,
              byteLength: saved.value.byteLength,
              width: image.width,
              height: image.height
            }
          }
        });
      }
      const frames = Array.isArray(result.frames) ? result.frames : [];
      if (frames.length === 0) {
        return fail({ code: 'invalid_state', message: PREVIEW_FRAMES_UNAVAILABLE });
      }
      const savedFrames: RenderPreviewResult['saved'] = { frames: [] };
      for (const frame of frames) {
        const saved = this.savePreviewDataUri(frame.dataUri, PREVIEW_FRAME_DATA_UNAVAILABLE, {
          nameHint: `${tmpName ?? 'preview'}_frame${frame.index}`,
          prefix: tmpPrefix ?? 'preview'
        });
        if (!saved.ok) return fail(saved.error);
        savedFrames.frames!.push({
          index: frame.index,
          path: saved.value.path,
          mime: frame.mime,
          byteLength: saved.value.byteLength,
          width: frame.width,
          height: frame.height
        });
      }
      return ok({ ...result, saved: savedFrames });
    });
  }
}
