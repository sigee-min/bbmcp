export const VALIDATION_NO_BONES = 'No bones present in the project.';
export const VALIDATION_ORPHAN_CUBE = (cube: string, bone: string) =>
  `Cube "${cube}" references missing bone "${bone}".`;
export const VALIDATION_DUPLICATE_BONE = (name: string) => `Duplicate bone name: ${name}`;
export const VALIDATION_DUPLICATE_CUBE = (name: string) => `Duplicate cube name: ${name}`;
export const VALIDATION_MAX_CUBES_EXCEEDED = (count: number, max: number) =>
  `Cube count (${count}) exceeds limit (${max}).`;
export const VALIDATION_ANIMATION_TOO_LONG = (name: string, maxSeconds: number) =>
  `Animation "${name}" exceeds max seconds (${maxSeconds}).`;
export const VALIDATION_TEXTURE_TOO_LARGE = (name: string, maxSize: number) =>
  `Texture "${name}" exceeds max size (${maxSize}px).`;
export const VALIDATION_TEXTURE_SIZE_MISMATCH = (
  name: string,
  width: number,
  height: number,
  resWidth: number,
  resHeight: number
) =>
  `Texture "${name}" size ${width}x${height} does not match project textureResolution ${resWidth}x${resHeight}.`;
export const VALIDATION_UV_OUT_OF_BOUNDS = (cube: string, u: number, v: number, width: number, height: number) =>
  `Cube "${cube}" UV ${u},${v} is outside texture resolution ${width}x${height}.`;
export const VALIDATION_TEXTURE_UNRESOLVED_REFS = (count: number) =>
  `Unresolved texture references detected (${count}). Assign textures before rendering.`;
export const VALIDATION_TEXTURE_UNASSIGNED = (name: string) =>
  `Texture "${name}" is not assigned to any cube faces.`;
export const VALIDATION_FACE_UV_OUT_OF_BOUNDS = (
  cube: string,
  face: string,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => `Face UV for "${cube}" (${face}) is outside ${width}x${height}: [${x1},${y1},${x2},${y2}].`;
export const VALIDATION_UV_OVERLAP = (textureName: string, conflictCount: number, example: string) =>
  `Texture "${textureName}" has overlapping UV rects (${conflictCount} conflict${conflictCount === 1 ? '' : 's'}).` +
  example;
export const VALIDATION_UV_SCALE_MISMATCH = (textureName: string, mismatchCount: number, example: string) =>
  `Texture "${textureName}" has UV scale mismatches (${mismatchCount}).${example}`;
export const VALIDATION_UV_SCALE_MISMATCH_SUMMARY = (mismatched: number, total: number) =>
  `UV scale mismatches detected (${mismatched}/${total} faces).`;
