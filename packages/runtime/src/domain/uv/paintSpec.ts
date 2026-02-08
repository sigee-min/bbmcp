import type { CubeFaceDirection } from '../model';

export type UvPaintScope = 'faces' | 'rects' | 'bounds';

export type UvPaintMapping = 'stretch' | 'tile';

export type UvPaintTarget = {
  cubeIds?: string[];
  cubeNames?: string[];
  faces?: CubeFaceDirection[];
};

export type UvPaintSource = {
  width?: number;
  height?: number;
};

export type UvPaintSpec = {
  scope?: UvPaintScope;
  mapping?: UvPaintMapping;
  target?: UvPaintTarget;
  source?: UvPaintSource;
  padding?: number;
  anchor?: [number, number];
};



