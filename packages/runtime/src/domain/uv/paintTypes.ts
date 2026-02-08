import type { UvPaintSpec } from './paintSpec';

export type UvPaintMessages = {
  usageMissing: (label: string) => string;
  targetCubesNotFound: (label: string) => string;
  targetFacesNotFound: (label: string) => string;
  noRects: (label: string) => string;
  noBounds: (label: string) => string;
  objectRequired: (label: string) => string;
  scopeInvalid: (label: string) => string;
  mappingInvalid: (label: string) => string;
  paddingInvalid: (label: string) => string;
  anchorFormat: (label: string) => string;
  anchorNumbers: (label: string) => string;
  sourceObject: (label: string) => string;
  sourceRequired: (label: string) => string;
  sourcePositive: (label: string) => string;
  sourceExceedsMax: (maxSize: number, label: string) => string;
  targetObject: (label: string) => string;
  targetCubeIdsRequired: (label: string) => string;
  targetCubeIdsString: (label: string) => string;
  targetCubeNamesRequired: (label: string) => string;
  targetCubeNamesString: (label: string) => string;
  targetFacesRequired: (label: string) => string;
  targetFacesInvalid: (label: string) => string;
};

export type UvPaintRect = { x1: number; y1: number; x2: number; y2: number };

export type UvPaintResolveInput = {
  id?: string;
  name?: string;
  targetId?: string;
  targetName?: string;
  uvPaint?: UvPaintSpec;
};
