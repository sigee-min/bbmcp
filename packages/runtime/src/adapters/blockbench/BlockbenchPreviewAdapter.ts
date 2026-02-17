import { errorMessage, Logger } from '../../logging';
import { RenderPreviewOutputKind, RenderPreviewPayload, RenderPreviewResult, ToolError } from '@ashfox/contracts/types/internal';
import { toolError } from '../../shared/tooling/toolResponse';
import { readGlobals } from './blockbenchUtils';
import {
  applyAngle,
  applyAnimationState,
  normalizeAngle,
  parseDataUrl,
  restoreAnimation,
  restoreCamera,
  selectPreview,
  snapshotAnimation,
  snapshotCamera,
  type CameraLike,
  type ControlsLike
} from './preview/previewUtils';
import {
  ADAPTER_PREVIEW_ANGLE_FIXED_ONLY,
  ADAPTER_PREVIEW_ANGLE_FIXED_ONLY_FIX,
  ADAPTER_PREVIEW_CANVAS_NO_SIZE,
  ADAPTER_PREVIEW_CANVAS_UNAVAILABLE,
  ADAPTER_PREVIEW_CLIP_REQUIRED,
  ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE,
  ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE_FIX,
  ADAPTER_PREVIEW_FIXED_SINGLE_ONLY,
  ADAPTER_PREVIEW_FIXED_SINGLE_ONLY_FIX,
  ADAPTER_PREVIEW_FPS_DURATION_POSITIVE,
  ADAPTER_PREVIEW_TIME_NON_NEGATIVE,
  ADAPTER_PREVIEW_TURNTABLE_CONTROLS_UNAVAILABLE,
  ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY,
  ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY_FIX
} from '../../shared/messages';

const DEFAULT_TURNTABLE_FPS = 20;
const DEFAULT_TURNTABLE_SECONDS = 2;
const MAX_TURNTABLE_FRAMES = 120;
export class BlockbenchPreviewAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  renderPreview(params: RenderPreviewPayload): { result?: RenderPreviewResult; error?: ToolError } {
    const globals = readGlobals();
    const previewRegistry = globals.Preview;
    const outputKind: RenderPreviewOutputKind =
      params.output ?? (params.mode === 'turntable' ? 'sequence' : 'single');
    if (params.mode === 'fixed' && outputKind !== 'single') {
      return {
        error: {
          code: 'invalid_payload',
          message: ADAPTER_PREVIEW_FIXED_SINGLE_ONLY,
          fix: ADAPTER_PREVIEW_FIXED_SINGLE_ONLY_FIX
        }
      };
    }
    if (params.mode === 'turntable' && outputKind !== 'sequence') {
      return {
        error: {
          code: 'invalid_payload',
          message: ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY,
          fix: ADAPTER_PREVIEW_TURNTABLE_SEQUENCE_ONLY_FIX
        }
      };
    }
    const preview = selectPreview(previewRegistry?.selected, previewRegistry?.all ?? []);
    const canvas = (preview?.canvas ??
      preview?.renderer?.domElement ??
      readGlobals().document?.querySelector?.('canvas')) as HTMLCanvasElement | null;
    if (!canvas || !canvas.toDataURL) {
      return { error: { code: 'invalid_state', message: ADAPTER_PREVIEW_CANVAS_UNAVAILABLE } };
    }
    if (!canvas.width || !canvas.height) {
      return { error: { code: 'invalid_state', message: ADAPTER_PREVIEW_CANVAS_NO_SIZE } };
    }
    const controls = (preview?.controls ?? null) as ControlsLike | null;
    const camera = (preview?.camera ?? null) as CameraLike | null;
    if (params.angle && !controls) {
      return {
        error: {
          code: 'invalid_state',
          message: ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE,
          fix: ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE_FIX
        }
      };
    }

    if (params.mode === 'turntable' && !controls) {
      return {
        error: {
          code: 'invalid_state',
          message: ADAPTER_PREVIEW_TURNTABLE_CONTROLS_UNAVAILABLE,
          fix: ADAPTER_PREVIEW_CONTROLS_UNAVAILABLE_FIX
        }
      };
    }

    const state = snapshotCamera(camera, controls);
    const animationState = snapshotAnimation();
    try {
      if (typeof params.timeSeconds === 'number' && !params.clip) {
        return { error: { code: 'invalid_payload', message: ADAPTER_PREVIEW_CLIP_REQUIRED } };
      }
      if (params.clip) {
        if (typeof params.timeSeconds === 'number' && params.timeSeconds < 0) {
          return { error: { code: 'invalid_payload', message: ADAPTER_PREVIEW_TIME_NON_NEGATIVE } };
        }
        const applied = applyAnimationState(params.clip, params.timeSeconds ?? 0);
        if (!applied.ok) {
          return { error: applied.error };
        }
      }

      if (params.mode === 'turntable' && params.angle) {
        return {
          error: {
            code: 'invalid_payload',
            message: ADAPTER_PREVIEW_ANGLE_FIXED_ONLY,
            fix: ADAPTER_PREVIEW_ANGLE_FIXED_ONLY_FIX
          }
        };
      }
      if (params.mode === 'fixed' && params.angle) {
        applyAngle(controls, camera, normalizeAngle(params.angle));
      }

      const renderFrame = () => {
        controls?.update?.();
        preview?.render?.();
      };

      if (outputKind === 'single') {
        renderFrame();
        const dataUrl = canvas.toDataURL('image/png');
        const parsed = parseDataUrl(dataUrl);
        if (!parsed.ok) {
          return { error: { code: 'io_error', message: parsed.message } };
        }
        const size = { width: canvas.width, height: canvas.height };
        this.log.info('preview captured', { kind: outputKind });
        return {
          result: {
            kind: outputKind,
            frameCount: 1,
            image: { ...parsed.value, ...size }
          }
        };
      }

      if (params.mode !== 'turntable') {
        return { error: { code: 'invalid_payload', message: ADAPTER_PREVIEW_FIXED_SINGLE_ONLY } };
      }

      if (!controls) {
        return { error: { code: 'invalid_state', message: ADAPTER_PREVIEW_TURNTABLE_CONTROLS_UNAVAILABLE } };
      }
      const fps = params.fps ?? DEFAULT_TURNTABLE_FPS;
      const durationSeconds = params.durationSeconds ?? DEFAULT_TURNTABLE_SECONDS;
      if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return { error: { code: 'invalid_payload', message: ADAPTER_PREVIEW_FPS_DURATION_POSITIVE } };
      }
      const requestedFrames = Math.max(1, Math.round(durationSeconds * fps));
      const frameCount = Math.min(requestedFrames, MAX_TURNTABLE_FRAMES);
      if (frameCount !== requestedFrames) {
        this.log.info('preview frames clamped', { requested: requestedFrames, clamped: frameCount });
      }
      const step = (Math.PI * 2) / frameCount;

      const frames: RenderPreviewResult['frames'] = [];
      const size = { width: canvas.width, height: canvas.height };
      for (let i = 0; i < frameCount; i += 1) {
        if (i > 0) controls.rotateLeft?.(step);
        renderFrame();
        const dataUrl = canvas.toDataURL('image/png');
        const parsed = parseDataUrl(dataUrl);
        if (!parsed.ok) {
          return { error: { code: 'io_error', message: parsed.message } };
        }
        frames.push({ index: i + 1, ...parsed.value, ...size });
      }
      this.log.info('preview sequence captured', { frames: frameCount });
      return {
        result: {
          kind: outputKind,
          frameCount,
          frames
        }
      };
    } catch (err) {
      const message = errorMessage(err, 'render preview failed');
      this.log.error('preview error', { message });
      return { error: toolError('unknown', message, { reason: 'adapter_exception', context: 'render_preview' }) };
    } finally {
      restoreCamera(camera, controls, state);
      restoreAnimation(animationState);
      controls?.update?.();
      preview?.render?.();
    }
  }
}



