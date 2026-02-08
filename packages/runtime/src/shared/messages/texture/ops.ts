export const TEXTURE_CANVAS_UNAVAILABLE = 'texture canvas not available';
export const TEXTURE_CANVAS_CONTEXT_UNAVAILABLE = 'texture canvas context not available';
export const TEXTURE_DATA_UNAVAILABLE = 'texture data unavailable';
export const TEXTURE_CONTENT_UNCHANGED = 'texture content unchanged';
export const TEXTURE_CONTENT_UNCHANGED_FIX =
  'Provide different image content or rename the texture to force an update. ' +
  'Avoid redundant updates when the intended pixels are unchanged.';

export const TEXTURE_RESOLUTION_POSITIVE = 'width and height must be positive numbers.';
export const TEXTURE_RESOLUTION_INTEGER = 'width and height must be integers.';
export const TEXTURE_RESOLUTION_EXCEEDS_MAX = (maxSize: number) =>
  `Texture resolution exceeds max size (${maxSize}).`;
export const TEXTURE_RESOLUTION_EXCEEDS_MAX_FIX = (maxSize: number) => `Use width/height <= ${maxSize}.`;

export const TEXTURE_ASSIGN_TARGET_REQUIRED = 'textureId or textureName is required';
export const TEXTURE_ASSIGN_TARGET_REQUIRED_FIX = 'Provide textureId or textureName from list_textures.';
export const TEXTURE_NOT_FOUND = (label: string) => `Texture not found: ${label}`;
export const TEXTURE_ASSIGN_NO_TARGETS = 'No target cubes found';
export const TEXTURE_ASSIGN_FACES_INVALID = 'faces must include valid directions (north/south/east/west/up/down)';
export const TEXTURE_PREFLIGHT_NO_UV_RECTS = 'No UV rects found; preflight cannot compute UV bounds.';
export const TEXTURE_PREFLIGHT_UNRESOLVED_REFS = (count: number) =>
  `Unresolved texture references detected (${count}).`;
export const TEXTURE_PREFLIGHT_BOUNDS_EXCEED = (
  uvWidth: number,
  uvHeight: number,
  texWidth: number,
  texHeight: number
) => `UV bounds exceed textureResolution (${uvWidth}x${uvHeight} > ${texWidth}x${texHeight}).`;
export const TEXTURE_PREFLIGHT_OVERLAP_WARNING = (name: string, count: number, example: string) =>
  `UV overlap detected for texture "${name}" (${count} conflict${count === 1 ? '' : 's'}).` +
  ` UV rects must not overlap.` +
  example;
export const TEXTURE_PREFLIGHT_SMALL_UV_RECTS = (name: string, count: number, minArea: number, example: string) =>
  `UV rects are very small for texture "${name}" (${count} rect${count === 1 ? '' : 's'}). ` +
  `Rects <= ${minArea}px can distort stretch mapping; consider tile mapping or a higher resolution.` +
  example;
export const TEXTURE_PREFLIGHT_SKEWED_UV_RECTS = (name: string, count: number, maxAspect: number, example: string) =>
  `UV rects are highly non-square for texture "${name}" (${count} rect${count === 1 ? '' : 's'}). ` +
  `Aspect ratio >= ${maxAspect}:1 can distort stretch mapping; consider tile mapping or re-packing UVs.` +
  example;
export const TEXTURE_FACE_UV_TARGET_FIX = 'Provide cubeId or cubeName from get_project_state.';
export const TEXTURE_FACE_UV_FACES_FIX = 'Provide a faces map with at least one face (e.g., {"north":[0,0,4,4]}).';
export const TEXTURE_FACE_UV_BOUNDS_FIX =
  'Use get_project_state to read textureResolution and adjust UVs or change the project texture resolution.';

export const TEXTURE_NAME_REQUIRED = 'Texture name is required';
export const TEXTURE_ALREADY_EXISTS = (name: string) => `Texture already exists: ${name}`;
export const TEXTURE_ID_EXISTS = (id: string) => `Texture id already exists: ${id}`;
export const TEXTURE_ID_OR_NAME_REQUIRED = 'Texture id or name is required';
export const TEXTURE_ID_OR_NAME_REQUIRED_FIX = 'Provide id or name for the texture.';

