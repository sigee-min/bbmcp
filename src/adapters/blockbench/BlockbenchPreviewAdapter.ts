import { Logger } from '../../logging';
import { RenderPreviewOutputKind, RenderPreviewPayload, RenderPreviewResult, ToolError } from '../../types';
import { PreviewItem } from '../../types/blockbench';
import { readGlobals } from './blockbenchUtils';
import { getAnimations } from './BlockbenchAnimationAdapter';

const DEFAULT_TURNTABLE_FPS = 20;
const DEFAULT_TURNTABLE_SECONDS = 2;
const DEG_TO_RAD = Math.PI / 180;

type DataUrlInfo = {
  mime: string;
  dataUri: string;
  byteLength: number;
};

const parseDataUrl = (dataUrl: string): { ok: true; value: DataUrlInfo } | { ok: false; message: string } => {
  const raw = String(dataUrl ?? '');
  const comma = raw.indexOf(',');
  if (comma === -1) {
    return { ok: false, message: 'invalid data url' };
  }
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1).trim();
  if (!meta.toLowerCase().includes('base64')) {
    return { ok: false, message: 'data url is not base64' };
  }
  const mimeMatch = /^data:([^;]+);/i.exec(meta);
  const mime = mimeMatch?.[1] ?? 'application/octet-stream';
  const normalized = payload.replace(/\s/g, '');
  if (!normalized) {
    return { ok: false, message: 'empty base64 payload' };
  }
  let padding = 0;
  if (normalized.endsWith('==')) padding = 2;
  else if (normalized.endsWith('=')) padding = 1;
  const byteLength = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
  return { ok: true, value: { mime, dataUri: `data:${mime};base64,${normalized}`, byteLength } };
};

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
          message: 'fixed mode only supports single output',
          fix: 'Set output="single" or use mode="turntable" for a sequence.'
        }
      };
    }
    if (params.mode === 'turntable' && outputKind !== 'sequence') {
      return {
        error: {
          code: 'invalid_payload',
          message: 'turntable mode only supports sequence output',
          fix: 'Set output="sequence" or use mode="fixed" for a single frame.'
        }
      };
    }
    const preview = selectPreview(previewRegistry?.selected, previewRegistry?.all ?? []);
    const canvas = (preview?.canvas ??
      preview?.renderer?.domElement ??
      document?.querySelector?.('canvas')) as HTMLCanvasElement | null;
    if (!canvas || !canvas.toDataURL) {
      return { error: { code: 'not_implemented', message: 'preview canvas not available' } };
    }
    if (!canvas.width || !canvas.height) {
      return { error: { code: 'not_implemented', message: 'preview canvas has no size' } };
    }
    const controls = preview?.controls ?? null;
    const camera = preview?.camera ?? null;
    if (params.angle && !controls) {
      return {
        error: {
          code: 'not_implemented',
          message: 'preview controls not available for angle',
          fix: 'Open a preview viewport and retry.'
        }
      };
    }

    if (params.mode === 'turntable' && !controls) {
      return {
        error: {
          code: 'not_implemented',
          message: 'turntable preview controls not available',
          fix: 'Open a preview viewport and retry.'
        }
      };
    }

    const state = snapshotCamera(camera, controls);
    const animationState = snapshotAnimation();
    try {
      if (typeof params.timeSeconds === 'number' && !params.clip) {
        return { error: { code: 'invalid_payload', message: 'clip is required when timeSeconds is set' } };
      }
      if (params.clip) {
        if (typeof params.timeSeconds === 'number' && params.timeSeconds < 0) {
          return { error: { code: 'invalid_payload', message: 'timeSeconds must be >= 0' } };
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
            message: 'angle is only supported for fixed previews',
            fix: 'Remove angle or switch to mode="fixed".'
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
        return { error: { code: 'invalid_payload', message: 'fixed mode only supports single output' } };
      }

      const fps = params.fps ?? DEFAULT_TURNTABLE_FPS;
      const durationSeconds = params.durationSeconds ?? DEFAULT_TURNTABLE_SECONDS;
      if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return { error: { code: 'invalid_payload', message: 'fps and durationSeconds must be > 0' } };
      }
      const frameCount = Math.max(1, Math.round(durationSeconds * fps));
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
      const message = err instanceof Error ? err.message : 'render preview failed';
      this.log.error('preview error', { message });
      return { error: { code: 'unknown', message } };
    } finally {
      restoreCamera(camera, controls, state);
      restoreAnimation(animationState);
      controls?.update?.();
      preview?.render?.();
    }
  }
}

type CameraLike = {
  position?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
  quaternion?: {
    x: number;
    y: number;
    z: number;
    w: number;
    set?: (x: number, y: number, z: number, w: number) => void;
    setFromAxisAngle?: (axis: { x: number; y: number; z: number }, radians: number) => void;
  };
  rotation?: { z: number };
  zoom?: number;
  updateProjectionMatrix?: () => void;
  rotateZ?: (radians: number) => void;
};

type ControlsLike = {
  target?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
  rotateUp?: (radians: number) => void;
  rotateLeft?: (radians: number) => void;
  update?: () => void;
};

type CameraSnapshot = {
  position: { x: number; y: number; z: number } | null;
  quaternion: { x: number; y: number; z: number; w: number } | null;
  target: { x: number; y: number; z: number } | null;
  zoom: number | null;
};

const snapshotCamera = (camera: CameraLike | null, controls: ControlsLike | null): CameraSnapshot => ({
  position: camera?.position
    ? { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    : null,
  quaternion: camera?.quaternion
    ? { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w }
    : null,
  target: controls?.target ? { x: controls.target.x, y: controls.target.y, z: controls.target.z } : null,
  zoom: typeof camera?.zoom === 'number' ? camera.zoom : null
});

const restoreCamera = (camera: CameraLike | null, controls: ControlsLike | null, state: CameraSnapshot) => {
  if (camera?.position && state.position) {
    if (typeof camera.position.set === 'function') {
      camera.position.set(state.position.x, state.position.y, state.position.z);
    } else {
      camera.position.x = state.position.x;
      camera.position.y = state.position.y;
      camera.position.z = state.position.z;
    }
  }
  if (camera?.quaternion && state.quaternion) {
    if (typeof camera.quaternion.set === 'function') {
      camera.quaternion.set(state.quaternion.x, state.quaternion.y, state.quaternion.z, state.quaternion.w);
    } else {
      camera.quaternion.x = state.quaternion.x;
      camera.quaternion.y = state.quaternion.y;
      camera.quaternion.z = state.quaternion.z;
      camera.quaternion.w = state.quaternion.w;
    }
  }
  if (controls?.target && state.target) {
    if (typeof controls.target.set === 'function') {
      controls.target.set(state.target.x, state.target.y, state.target.z);
    } else {
      controls.target.x = state.target.x;
      controls.target.y = state.target.y;
      controls.target.z = state.target.z;
    }
  }
  if (typeof state.zoom === 'number' && typeof camera?.zoom === 'number') {
    camera.zoom = state.zoom;
    camera.updateProjectionMatrix?.();
  }
};

type AnimationSnapshot = {
  selectedName: string | null;
  timeSeconds: number | null;
};

const snapshotAnimation = (): AnimationSnapshot => {
  const globals = readGlobals();
  const animationGlobal = globals.Animation;
  const selected = animationGlobal?.selected ?? globals.Animation?.selected;
  const selectedName = selected?.name ?? null;
  const timeSeconds =
    typeof selected?.time === 'number'
      ? selected.time
      : typeof globals.Animator?.time === 'number'
        ? globals.Animator.time
        : null;
  return { selectedName, timeSeconds };
};

const applyAnimationState = (
  clipName: string | undefined,
  timeSeconds: number
): { ok: true } | { ok: false; error: ToolError } => {
  if (!clipName) return { ok: true };
  const globals = readGlobals();
  const animations = getAnimations();
  const clip = animations.find((a) => a.name === clipName);
  if (!clip) {
    return { ok: false, error: { code: 'invalid_payload', message: `animation clip not found: ${clipName}` } };
  }
  const maxTime = Number(clip?.length ?? clip?.animation_length ?? clip?.duration ?? NaN);
  const clampedTime = Number.isFinite(maxTime) && maxTime > 0 ? Math.min(Math.max(timeSeconds, 0), maxTime) : timeSeconds;
  if (typeof clip.select === 'function') {
    clip.select();
  } else if (globals.Animation?.selected) {
    globals.Animation.selected = clip;
  }
  if (Number.isFinite(clampedTime)) {
    if (typeof clip.setTime === 'function') {
      clip.setTime(clampedTime);
    } else if (typeof globals.Animator?.setTime === 'function') {
      globals.Animator.setTime(clampedTime);
    } else if (typeof globals.Animator?.preview === 'function') {
      globals.Animator.preview(clampedTime);
    } else if (typeof clip.time === 'number') {
      clip.time = clampedTime;
    }
  }
  return { ok: true };
};

const restoreAnimation = (snapshot: AnimationSnapshot) => {
  if (!snapshot.selectedName) return;
  const globals = readGlobals();
  const animations = getAnimations();
  const clip = animations.find((a) => a.name === snapshot.selectedName);
  if (!clip) return;
  if (typeof clip.select === 'function') {
    clip.select();
  } else if (globals.Animation?.selected) {
    globals.Animation.selected = clip;
  }
  if (typeof snapshot.timeSeconds === 'number') {
    if (typeof clip.setTime === 'function') {
      clip.setTime(snapshot.timeSeconds);
    } else if (typeof globals.Animator?.setTime === 'function') {
      globals.Animator.setTime(snapshot.timeSeconds);
    } else if (typeof globals.Animator?.preview === 'function') {
      globals.Animator.preview(snapshot.timeSeconds);
    } else if (typeof clip.time === 'number') {
      clip.time = snapshot.timeSeconds;
    }
  }
};

type AngleTuple = [number, number, number];

const normalizeAngle = (angle: [number, number] | [number, number, number]): AngleTuple => {
  const [pitch, yaw, roll] = angle;
  return [pitch, yaw, roll ?? 0];
};

const applyAngle = (controls: ControlsLike | null, camera: CameraLike | null, angle: AngleTuple) => {
  if (!controls) return;
  const [pitch, yaw, roll] = angle;
  if (Number.isFinite(pitch)) controls.rotateUp?.(pitch * DEG_TO_RAD);
  if (Number.isFinite(yaw)) controls.rotateLeft?.(yaw * DEG_TO_RAD);
  if (Number.isFinite(roll)) applyRoll(camera, roll * DEG_TO_RAD);
};

const applyRoll = (camera: CameraLike | null, radians: number) => {
  if (!camera) return;
  if (typeof camera.rotateZ === 'function') {
    camera.rotateZ(radians);
    return;
  }
  if (camera.rotation && typeof camera.rotation.z === 'number') {
    camera.rotation.z += radians;
    return;
  }
  if (camera.quaternion && typeof camera.quaternion.setFromAxisAngle === 'function') {
    const axis = { x: 0, y: 0, z: 1 };
    camera.quaternion.setFromAxisAngle(axis, radians);
  }
};

const selectPreview = (selected: PreviewItem | null | undefined, all: PreviewItem[]): PreviewItem | null => {
  if (selected?.canvas) return selected;
  return all.find((p) => Boolean(p?.canvas)) ?? null;
};
