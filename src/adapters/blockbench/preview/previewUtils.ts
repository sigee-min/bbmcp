import type { PreviewItem } from '../../../types/blockbench';
import type { ToolError } from '@ashfox/contracts/types/internal';
import { toolError } from '../../../shared/tooling/toolResponse';
import { readGlobals } from '../blockbenchUtils';
import { getAnimations } from '../animation/animationCommands';
import {
  ADAPTER_PREVIEW_ANIMATION_CLIP_NOT_FOUND,
  ADAPTER_PREVIEW_DATA_URL_EMPTY,
  ADAPTER_PREVIEW_DATA_URL_INVALID,
  ADAPTER_PREVIEW_DATA_URL_NOT_BASE64
} from '../../../shared/messages';

const DEG_TO_RAD = Math.PI / 180;

export type DataUrlInfo = {
  mime: string;
  dataUri: string;
  byteLength: number;
};

export const parseDataUrl = (dataUrl: string): { ok: true; value: DataUrlInfo } | { ok: false; message: string } => {
  const raw = String(dataUrl ?? '');
  const comma = raw.indexOf(',');
  if (comma === -1) {
    return { ok: false, message: ADAPTER_PREVIEW_DATA_URL_INVALID };
  }
  const meta = raw.slice(0, comma);
  const payload = raw.slice(comma + 1).trim();
  if (!meta.toLowerCase().includes('base64')) {
    return { ok: false, message: ADAPTER_PREVIEW_DATA_URL_NOT_BASE64 };
  }
  const mimeMatch = /^data:([^;]+);/i.exec(meta);
  const mime = mimeMatch?.[1] ?? 'application/octet-stream';
  const normalized = payload.replace(/\s/g, '');
  if (!normalized) {
    return { ok: false, message: ADAPTER_PREVIEW_DATA_URL_EMPTY };
  }
  let padding = 0;
  if (normalized.endsWith('==')) padding = 2;
  else if (normalized.endsWith('=')) padding = 1;
  const byteLength = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
  return { ok: true, value: { mime, dataUri: `data:${mime};base64,${normalized}`, byteLength } };
};

export type CameraLike = {
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

export type ControlsLike = {
  target?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
  rotateUp?: (radians: number) => void;
  rotateLeft?: (radians: number) => void;
  update?: () => void;
};

export type CameraSnapshot = {
  position: { x: number; y: number; z: number } | null;
  quaternion: { x: number; y: number; z: number; w: number } | null;
  target: { x: number; y: number; z: number } | null;
  zoom: number | null;
};

export const snapshotCamera = (camera: CameraLike | null, controls: ControlsLike | null): CameraSnapshot => ({
  position: camera?.position
    ? { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    : null,
  quaternion: camera?.quaternion
    ? { x: camera.quaternion.x, y: camera.quaternion.y, z: camera.quaternion.z, w: camera.quaternion.w }
    : null,
  target: controls?.target ? { x: controls.target.x, y: controls.target.y, z: controls.target.z } : null,
  zoom: typeof camera?.zoom === 'number' ? camera.zoom : null
});

export const restoreCamera = (camera: CameraLike | null, controls: ControlsLike | null, state: CameraSnapshot) => {
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

export type AnimationSnapshot = {
  selectedName: string | null;
  timeSeconds: number | null;
};

export const snapshotAnimation = (): AnimationSnapshot => {
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

export const applyAnimationState = (
  clipName: string | undefined,
  timeSeconds: number
): { ok: true } | { ok: false; error: ToolError } => {
  if (!clipName) return { ok: true };
  const globals = readGlobals();
  const animations = getAnimations();
  const clip = animations.find((a) => a.name === clipName);
  if (!clip) {
    return { ok: false, error: toolError('invalid_payload', ADAPTER_PREVIEW_ANIMATION_CLIP_NOT_FOUND(clipName)) };
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

export const restoreAnimation = (snapshot: AnimationSnapshot) => {
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

export type AngleTuple = [number, number, number];

export const normalizeAngle = (angle: [number, number] | [number, number, number]): AngleTuple => {
  const [pitch, yaw, roll] = angle;
  return [pitch, yaw, roll ?? 0];
};

export const applyAngle = (controls: ControlsLike | null, camera: CameraLike | null, angle: AngleTuple) => {
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

export const selectPreview = (selected: PreviewItem | null | undefined, all: PreviewItem[]): PreviewItem | null => {
  if (selected?.canvas) return selected;
  return all.find((p) => Boolean(p?.canvas)) ?? null;
};

