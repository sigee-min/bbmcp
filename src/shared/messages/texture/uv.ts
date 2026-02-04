export const UV_USAGE_REQUIRED = 'uvUsageId is required. Call preflight_texture first.';
export const UV_USAGE_MISSING_MESSAGE = 'uvUsageId is missing. Call preflight_texture first.';

export const UV_USAGE_CHANGED_MESSAGE = 'UV usage changed since preflight_texture. Refresh preflight and retry.';
export const UV_USAGE_CHANGED_FIX =
  'Call preflight_texture without texture filters and retry with the new uvUsageId.';

export const UV_BOUNDS_NEGATIVE = 'UV bounds must be non-negative.';
export const UV_BOUNDS_ORDER = 'UV bounds must be ordered [x1,y1,x2,y2].';
export const UV_BOUNDS_OUT_OF_BOUNDS = (width: number, height: number) =>
  `UV bounds exceed textureResolution (${width}x${height}).`;

export const UV_ATLAS_RESOLUTION_POSITIVE = 'UV atlas resolution must be positive numbers.';
export const UV_ATLAS_MAX_RESOLUTION_POSITIVE = 'UV atlas max resolution must be positive numbers.';
export const UV_ATLAS_EXCEEDS_MAX = 'UV atlas resolution exceeds maximum texture size.';
export const UV_ATLAS_CUBE_MISSING = (name: string) => `Cube not found for UV atlas: ${name}`;
export const UV_ATLAS_DERIVE_SIZE_FAILED = (cube: string, face: string) =>
  `Failed to derive UV size for ${cube} (${face}).`;
export const UV_ATLAS_UV_SIZE_EXCEEDS = (cube: string, face: string) =>
  `UV size exceeds atlas resolution for ${cube} (${face}).`;
export const UV_ATLAS_OVERFLOW = 'UV atlas overflow. Increase texture size or reduce faces.';

export const TEXTURE_AUTO_UV_NO_TEXTURES = 'No textures available for auto UV atlas.';
export const TEXTURE_AUTO_UV_RESOLUTION_MISSING = 'Project texture resolution is missing.';
export const TEXTURE_AUTO_UV_UNRESOLVED_REFS = (count: number) =>
  `Unresolved texture references detected (${count}).`;

export const UV_ASSIGNMENT_TARGET_REQUIRED =
  'assignment must include cubeId/cubeName or cubeIds/cubeNames.';

export const UV_ASSIGNMENTS_REQUIRED = 'assignments must be a non-empty array';
export const UV_ASSIGNMENT_OBJECT_REQUIRED = 'assignment must be an object';
export const UV_ASSIGNMENT_CUBE_IDS_STRING_ARRAY = 'cubeIds must be an array of strings';
export const UV_ASSIGNMENT_CUBE_NAMES_STRING_ARRAY = 'cubeNames must be an array of strings';
export const UV_ASSIGNMENT_FACES_REQUIRED = 'faces is required for each assignment';
export const UV_ASSIGNMENT_FACES_NON_EMPTY = 'faces must include at least one mapping';
export const UV_ASSIGNMENT_INVALID_FACE = (face: string) => `invalid face: ${face}`;
export const UV_ASSIGNMENT_UV_FORMAT = (face: string) => `UV for ${face} must be [x1,y1,x2,y2]`;
export const UV_ASSIGNMENT_UV_NUMBERS = (face: string) => `UV for ${face} must contain finite numbers`;

export const TEXTURE_FACE_UV_SMALL_RECTS = (
  cubeName: string,
  count: number,
  minArea: number,
  example: string
) =>
  `UV rects on "${cubeName}" are very small (<= ${minArea}px²). ${count} face(s) affected.${example}`;

export const TEXTURE_FACE_UV_SKEWED_RECTS = (
  cubeName: string,
  count: number,
  maxAspect: number,
  example: string
) =>
  `UV rects on "${cubeName}" are highly non-square (aspect >= ${maxAspect}:1). ${count} face(s) affected.${example}`;

export const UV_OVERLAP_MESSAGE = (
  names: string,
  suffix: string,
  example: string,
  plural: boolean
) =>
  `UV overlap detected for texture${plural ? 's' : ''} ${names}${suffix}. Only identical UV rects may overlap.${example}`;
export const UV_OVERLAP_FIX =
  'Adjust UVs so only identical rects overlap, then call preflight_texture and retry. ' +
  'For recovery, run auto_uv_atlas (apply=true), then preflight_texture again.';

export const UV_SCALE_MESSAGE = (
  names: string,
  suffix: string,
  example: string,
  plural: boolean
) => `UV scale mismatch detected for texture${plural ? 's' : ''} ${names}${suffix}.${example}`;
export const UV_SCALE_FIX =
  'For recovery, run auto_uv_atlas (apply=true), then preflight_texture again. ' +
  'If this repeats, increase texture resolution (e.g., 64x64+), reduce cube count, or simplify UVs.';
