import type { BlockbenchCanvasApi, CanvasUpdateViewOptions } from '../../../types/blockbench';
import type { ViewportEffect } from '../../../shared/tooling/viewportEffects';

type CanvasFallbackStrategy = (canvas: BlockbenchCanvasApi) => boolean;

const updateViewOptionsByEffect: Partial<Record<ViewportEffect, CanvasUpdateViewOptions>> = {
  geometry: {
    element_aspects: { geometry: true, transform: true, faces: true, uv: true, visibility: true },
    group_aspects: { transform: true, visibility: true },
    selection: true
  },
  texture: {
    element_aspects: { faces: true, uv: true, painting_grid: true },
    selection: true
  },
  animation: {
    element_aspects: { transform: true, faces: true, geometry: true, visibility: true },
    group_aspects: { transform: true, visibility: true },
    selection: true
  },
  project: {
    element_aspects: { faces: true, geometry: true, painting_grid: true, transform: true, uv: true, visibility: true },
    group_aspects: { transform: true, visibility: true },
    selection: true
  }
};

const fallbackByEffect: Record<ViewportEffect, CanvasFallbackStrategy> = {
  geometry: (canvas) => {
    const changed =
      runCanvasCall(canvas.updateAllPositions) ||
      runCanvasCall(canvas.updateAllBones) ||
      runCanvasCall(canvas.updateAllUVs) ||
      runCanvasCall(canvas.updateAllFaces) ||
      runCanvasCall(canvas.updateVisibility);
    return changed || runCanvasCall(canvas.updateAll);
  },
  texture: (canvas) => {
    const changed =
      runCanvasCall(canvas.updateAllUVs) ||
      runCanvasCall(canvas.updateAllFaces) ||
      runCanvasCall(canvas.updateLayeredTextures) ||
      runCanvasCall(canvas.updateSelectedFaces);
    return changed || runCanvasCall(canvas.updateAll);
  },
  animation: (canvas) => {
    const changed =
      runCanvasCall(canvas.updateAllBones) ||
      runCanvasCall(canvas.updateAllPositions) ||
      runCanvasCall(canvas.updateAllFaces);
    return changed || runCanvasCall(canvas.updateAll);
  },
  project: (canvas) => runCanvasCall(canvas.updateAll),
  none: () => false
};

export const invalidateCanvas = (
  canvas: BlockbenchCanvasApi | undefined,
  effect: ViewportEffect
): boolean => {
  if (!canvas) return false;
  const updateViewOptions = updateViewOptionsByEffect[effect];
  if (updateViewOptions && runCanvasCall(canvas.updateView, updateViewOptions)) {
    return true;
  }
  return fallbackByEffect[effect](canvas);
};

const runCanvasCall = <TArgs extends unknown[]>(fn: ((...args: TArgs) => void) | undefined, ...args: TArgs): boolean => {
  if (typeof fn !== 'function') return false;
  fn(...args);
  return true;
};
