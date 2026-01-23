import type { RenderPreviewPayload, RenderPreviewResult, ToolError } from '../types';
import type { EditorPort } from '../ports/editor';
import type { TmpStorePort } from '../ports/tmpStore';
import { ok, fail, UsecaseResult } from './result';

export interface RenderServiceDeps {
  editor: EditorPort;
  tmpStore?: TmpStorePort;
  ensureActive: () => ToolError | null;
}

export class RenderService {
  private readonly editor: EditorPort;
  private readonly tmpStore?: TmpStorePort;
  private readonly ensureActive: () => ToolError | null;

  constructor(deps: RenderServiceDeps) {
    this.editor = deps.editor;
    this.tmpStore = deps.tmpStore;
    this.ensureActive = deps.ensureActive;
  }

  renderPreview(payload: RenderPreviewPayload): UsecaseResult<RenderPreviewResult> {
    const activeErr = this.ensureActive();
    if (activeErr) return fail(activeErr);
    const { saveToTmp, tmpName, tmpPrefix, ...previewPayload } = payload;
    const res = this.editor.renderPreview(previewPayload);
    if (res.error) return fail(res.error);
    const result = res.result!;
    if (!saveToTmp) return ok(result);
    if (result.kind === 'single') {
      const image = result.image;
      if (!image?.dataUri) {
        return fail({ code: 'not_implemented', message: 'Preview image data unavailable.' });
      }
      if (!this.tmpStore) {
        return fail({ code: 'not_implemented', message: 'Tmp store is not available.' });
      }
      const saved = this.tmpStore.saveDataUri(image.dataUri, {
        nameHint: tmpName ?? 'preview',
        prefix: tmpPrefix ?? 'preview'
      });
      if (!saved.ok) return fail(saved.error);
      return ok({
        ...result,
        saved: {
          image: {
            path: saved.data.path,
            mime: image.mime,
            byteLength: saved.data.byteLength,
            width: image.width,
            height: image.height
          }
        }
      });
    }
    const frames = Array.isArray(result.frames) ? result.frames : [];
    if (frames.length === 0) {
      return fail({ code: 'not_implemented', message: 'Preview frames unavailable.' });
    }
    const savedFrames: RenderPreviewResult['saved'] = { frames: [] };
    for (const frame of frames) {
      if (!frame.dataUri) {
        return fail({ code: 'not_implemented', message: 'Preview frame data unavailable.' });
      }
      if (!this.tmpStore) {
        return fail({ code: 'not_implemented', message: 'Tmp store is not available.' });
      }
      const saved = this.tmpStore.saveDataUri(frame.dataUri, {
        nameHint: `${tmpName ?? 'preview'}_frame${frame.index}`,
        prefix: tmpPrefix ?? 'preview'
      });
      if (!saved.ok) return fail(saved.error);
      savedFrames.frames!.push({
        index: frame.index,
        path: saved.data.path,
        mime: frame.mime,
        byteLength: saved.data.byteLength,
        width: frame.width,
        height: frame.height
      });
    }
    return ok({ ...result, saved: savedFrames });
  }
}
