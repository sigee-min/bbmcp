export const TEXTURE_OPS_TOO_MANY = (maxOps: number, label: string) =>
  `too many texture ops (>${maxOps}) (${label})`;
export const TEXTURE_OP_INVALID = (label: string) => `invalid texture op (${label})`;

export const TEXTURE_PAINT_MODE_INVALID = (mode: string) => `texture paint mode invalid (${mode})`;
export const TEXTURE_PAINT_NAME_REQUIRED = 'texture name is required for paint_texture';
export const TEXTURE_PAINT_TARGET_REQUIRED = 'paint_texture requires targetId or targetName for update';
export const TEXTURE_PAINT_UV_USAGE_REQUIRED = 'uvUsageId is required when uvPaint is provided';
export const TEXTURE_PAINT_SIZE_EXCEEDS_MAX = (maxSize: number) =>
  `texture paint size exceeds max ${maxSize}`;
export const TEXTURE_PAINT_SIZE_EXCEEDS_MAX_FIX = (maxSize: number) =>
  `Use width/height <= ${maxSize}.`;
export const TEXTURE_OP_COLOR_INVALID = (label: string) => `invalid texture op color (${label})`;
export const TEXTURE_OP_LINEWIDTH_INVALID = (label: string) => `invalid texture op lineWidth (${label})`;
export const TEXTURE_RENDERER_UNAVAILABLE = 'texture renderer unavailable';
export const TEXTURE_RENDERER_NO_IMAGE = 'texture renderer did not return an image';
export const TEXTURE_FACES_TARGET_REQUIRED = 'paint_faces requires a target object.';
export const TEXTURE_FACES_TARGET_SELECTOR_REQUIRED = 'paint_faces target must include cubeId or cubeName.';
export const TEXTURE_FACES_TEXTURE_REQUIRED =
  'paint_faces requires textureName or textureId when project name is unavailable.';
export const TEXTURE_FACES_SIZE_REQUIRED =
  'paint_faces requires width/height when texture size is unavailable.';
export const TEXTURE_FACES_OP_REQUIRED = 'paint_faces requires a single op object.';
export const TEXTURE_FACES_COORD_SPACE_INVALID =
  'paint_faces coordSpace must be "face" or "texture".';
export const TEXTURE_FACES_TEXTURE_COORDS_SIZE_REQUIRED =
  'paint_faces with coordSpace="texture" requires width and height.';
export const TEXTURE_FACES_TEXTURE_COORDS_SIZE_MISMATCH = (
  expectedWidth: number,
  expectedHeight: number,
  width: number,
  height: number
) =>
  `paint_faces coordSpace="texture" requires width/height to match texture size (${expectedWidth}x${expectedHeight}); got ${width}x${height}.`;
export const TEXTURE_FACES_OP_OUTSIDE_SOURCE = (
  coordSpace: 'face' | 'texture',
  width: number,
  height: number
) =>
  `paint_faces op is outside the ${coordSpace} source bounds (${width}x${height}); adjust op coordinates or source size.`;
export const TEXTURE_FACES_OP_OUTSIDE_TARGET =
  'paint_faces op does not overlap the target face UV bounds in texture coordinate space.';

export const TEXTURE_MESH_FACE_TARGET_REQUIRED = 'paint_mesh_face requires a target object.';
export const TEXTURE_MESH_FACE_TARGET_SELECTOR_REQUIRED =
  'paint_mesh_face target must include meshId or meshName.';
export const TEXTURE_MESH_FACE_SCOPE_INVALID =
  'paint_mesh_face scope must be "single_face" or "all_faces".';
export const TEXTURE_MESH_FACE_SCOPE_SINGLE_REQUIRES_FACE_ID =
  'paint_mesh_face scope="single_face" requires target.faceId.';
export const TEXTURE_MESH_FACE_SCOPE_ALL_FORBIDS_FACE_ID =
  'paint_mesh_face scope="all_faces" does not allow target.faceId.';
export const TEXTURE_MESH_FACE_TEXTURE_REQUIRED =
  'paint_mesh_face requires textureName or textureId when project name is unavailable.';
export const TEXTURE_MESH_FACE_OP_REQUIRED = 'paint_mesh_face requires a single op object.';
export const TEXTURE_MESH_FACE_COORD_SPACE_INVALID =
  'paint_mesh_face coordSpace must be "face" or "texture".';
export const TEXTURE_MESH_FACE_SIZE_REQUIRED =
  'paint_mesh_face requires width/height when texture size is unavailable.';
export const TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_REQUIRED =
  'paint_mesh_face with coordSpace="texture" requires width and height.';
export const TEXTURE_MESH_FACE_TEXTURE_COORDS_SIZE_MISMATCH = (
  expectedWidth: number,
  expectedHeight: number,
  width: number,
  height: number
) =>
  `paint_mesh_face coordSpace="texture" requires width/height to match texture size (${expectedWidth}x${expectedHeight}); got ${width}x${height}.`;
export const TEXTURE_MESH_FACE_OP_OUTSIDE_SOURCE = (
  coordSpace: 'face' | 'texture',
  width: number,
  height: number
) =>
  `paint_mesh_face op is outside the ${coordSpace} source bounds (${width}x${height}); adjust op coordinates or source size.`;
export const TEXTURE_MESH_FACE_OP_OUTSIDE_TARGET =
  'paint_mesh_face op does not overlap selected mesh face UV bounds in texture coordinate space.';
export const TEXTURE_MESH_FACE_NOT_FOUND = (faceId: string) =>
  `paint_mesh_face face not found on target mesh: ${faceId}`;
export const TEXTURE_MESH_FACE_UV_REQUIRED = (faceId: string) =>
  `paint_mesh_face target face has missing or invalid uv: ${faceId}`;
export const TEXTURE_MESH_FACE_NO_PAINTABLE_FACES =
  'paint_mesh_face could not find any paintable faces with valid uv.';

export const UV_PAINT_USAGE_MISSING = (label: string) =>
  `No UV usage found for texture "${label}". Assign the texture and retry after UV refresh.`;
export const UV_PAINT_TARGET_CUBES_NOT_FOUND = (label: string) =>
  `uvPaint target cubes not found for texture "${label}".`;
export const UV_PAINT_TARGET_FACES_NOT_FOUND = (label: string) =>
  `uvPaint target faces not found for texture "${label}".`;
export const UV_PAINT_NO_RECTS = (label: string) =>
  `No UV rects found for texture "${label}". Assign the texture and retry after UV refresh.`;
export const UV_PAINT_NO_BOUNDS = (label: string) => `No UV bounds found for texture "${label}".`;
export const UV_PAINT_OBJECT_REQUIRED = (label: string) => `uvPaint must be an object (${label})`;
export const UV_PAINT_SCOPE_INVALID = (label: string) => `uvPaint scope invalid (${label})`;
export const UV_PAINT_MAPPING_INVALID = (label: string) => `uvPaint mapping invalid (${label})`;
export const UV_PAINT_PADDING_INVALID = (label: string) => `uvPaint padding invalid (${label})`;
export const UV_PAINT_ANCHOR_FORMAT = (label: string) => `uvPaint anchor must be [x,y] (${label})`;
export const UV_PAINT_ANCHOR_NUMBERS = (label: string) => `uvPaint anchor must be numbers (${label})`;
export const UV_PAINT_SOURCE_OBJECT = (label: string) => `uvPaint source must be an object (${label})`;
export const UV_PAINT_SOURCE_REQUIRED = (label: string) => `uvPaint source width/height required (${label})`;
export const UV_PAINT_SOURCE_POSITIVE = (label: string) =>
  `uvPaint source width/height must be positive integers (${label})`;
export const UV_PAINT_SOURCE_EXCEEDS_MAX = (maxSize: number, label: string) =>
  `uvPaint source size exceeds max ${maxSize} (${label})`;
export const UV_PAINT_SOURCE_AXIS_POSITIVE = (axis: string, label: string) =>
  `uvPaint source ${axis} must be > 0 (${label})`;
export const UV_PAINT_SOURCE_AXIS_INTEGER = (axis: string, label: string) =>
  `uvPaint source ${axis} must be an integer (${label})`;
export const UV_PAINT_TARGET_OBJECT = (label: string) => `uvPaint target must be an object (${label})`;
export const UV_PAINT_TARGET_CUBE_IDS_REQUIRED = (label: string) =>
  `uvPaint target cubeIds must be a non-empty array (${label})`;
export const UV_PAINT_TARGET_CUBE_IDS_STRING = (label: string) => `uvPaint target cubeIds must be strings (${label})`;
export const UV_PAINT_TARGET_CUBE_NAMES_REQUIRED = (label: string) =>
  `uvPaint target cubeNames must be a non-empty array (${label})`;
export const UV_PAINT_TARGET_CUBE_NAMES_STRING = (label: string) =>
  `uvPaint target cubeNames must be strings (${label})`;
export const UV_PAINT_TARGET_FACES_REQUIRED = (label: string) =>
  `uvPaint target faces must be a non-empty array (${label})`;
export const UV_PAINT_TARGET_FACES_INVALID = (label: string) => `uvPaint target faces invalid (${label})`;
export const UV_PAINT_RECTS_REQUIRED = (label: string) => `uvPaint requires at least one rect (${label})`;
export const UV_PAINT_SOURCE_TARGET_POSITIVE = (label: string) =>
  `uvPaint requires positive source/target sizes (${label})`;
export const UV_PAINT_SOURCE_DATA_MISMATCH = (label: string) => `uvPaint source data size mismatch (${label})`;
export const UV_PAINT_RECT_INVALID = (label: string) => `uvPaint rect is invalid (${label})`;
export const UV_PAINT_PADDING_EXCEEDS_RECT = (label: string) => `uvPaint padding exceeds rect size (${label})`;
export const UV_PAINT_RECT_OUTSIDE_BOUNDS = (label: string) =>
  `uvPaint rect is outside texture bounds (${label})`;
