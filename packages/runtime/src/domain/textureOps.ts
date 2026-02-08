export const MAX_TEXTURE_OPS = 4096;

import { isFiniteNumber, isRecord } from './guards';

export type FillShadeDirection = 'tl_br' | 'tr_bl' | 'top_bottom' | 'left_right';

export type FillRectShadeLike =
  | boolean
  | {
      enabled?: boolean;
      intensity?: number;
      edge?: number;
      noise?: number;
      seed?: number;
      lightDir?: FillShadeDirection;
    };

export type TextureOpLike =
  | { op: 'set_pixel'; x: number; y: number; color: string }
  | { op: 'fill_rect'; x: number; y: number; width: number; height: number; color: string; shade?: FillRectShadeLike }
  | { op: 'draw_rect'; x: number; y: number; width: number; height: number; color: string; lineWidth?: number }
  | { op: 'draw_line'; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth?: number };

const SHADE_DIRECTIONS: ReadonlySet<string> = new Set(['tl_br', 'tr_bl', 'top_bottom', 'left_right']);

const isFillRectShade = (value: unknown): value is FillRectShadeLike => {
  if (value === undefined || typeof value === 'boolean') return true;
  if (!isRecord(value)) return false;
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false;
  if (value.intensity !== undefined && !isFiniteNumber(value.intensity)) return false;
  if (value.edge !== undefined && !isFiniteNumber(value.edge)) return false;
  if (value.noise !== undefined && !isFiniteNumber(value.noise)) return false;
  if (value.seed !== undefined && !isFiniteNumber(value.seed)) return false;
  if (value.lightDir !== undefined && (typeof value.lightDir !== 'string' || !SHADE_DIRECTIONS.has(value.lightDir))) {
    return false;
  }
  return true;
};

export const isTextureOp = (op: unknown): op is TextureOpLike => {
  if (!isRecord(op) || typeof op.op !== 'string') return false;
  switch (op.op) {
    case 'set_pixel':
      return isFiniteNumber(op.x) && isFiniteNumber(op.y) && typeof op.color === 'string';
    case 'fill_rect':
      return (
        isFiniteNumber(op.x) &&
        isFiniteNumber(op.y) &&
        isFiniteNumber(op.width) &&
        isFiniteNumber(op.height) &&
        typeof op.color === 'string' &&
        isFillRectShade(op.shade)
      );
    case 'draw_rect':
      return (
        isFiniteNumber(op.x) &&
        isFiniteNumber(op.y) &&
        isFiniteNumber(op.width) &&
        isFiniteNumber(op.height) &&
        typeof op.color === 'string'
      );
    case 'draw_line':
      return (
        isFiniteNumber(op.x1) &&
        isFiniteNumber(op.y1) &&
        isFiniteNumber(op.x2) &&
        isFiniteNumber(op.y2) &&
        typeof op.color === 'string'
      );
    default:
      return false;
  }
};



