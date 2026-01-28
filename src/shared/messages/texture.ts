export const UV_USAGE_MISSING_MESSAGE = 'uvUsageId is missing. Call preflight_texture first.';

export const UV_USAGE_CHANGED_MESSAGE = 'UV usage changed since preflight_texture. Refresh preflight and retry.';
export const UV_USAGE_CHANGED_FIX =
  'Call preflight_texture without texture filters and retry with the new uvUsageId.';

export const UV_ASSIGNMENT_TARGET_REQUIRED =
  'assignment must include cubeId/cubeName or cubeIds/cubeNames.';
export const UV_ASSIGNMENT_CUBE_ID_NOT_FOUND = (id: string) => `Cube not found for id: ${id}`;
export const UV_ASSIGNMENT_CUBE_NAME_DUPLICATE = (name: string) =>
  `Cube name "${name}" is duplicated. Use cubeId instead.`;
export const UV_ASSIGNMENT_CUBE_NAME_NOT_FOUND = (name: string) => `Cube not found: ${name}`;
export const UV_ASSIGNMENT_UNBOUND_FACE = (cubeName: string, face: string) =>
  `UV target ${cubeName} (${face}) is not bound to a texture. Assign the texture first.`;
export const UV_ASSIGNMENT_CONFLICT = (cubeName: string, face: string) =>
  `Conflicting UV assignments for ${cubeName} (${face}).`;

export const TEXTURE_PIPELINE_STEP_REQUIRED =
  'texture_pipeline requires at least one step (assign, uv, textures, presets, preflight, preview).';
export const ASSIGN_MUST_BE_ARRAY = 'assign must be an array';
export const ASSIGN_ENTRY_REQUIRES_TEXTURE = 'assign entry requires textureId or textureName';
export const ASSIGN_CUBE_IDS_ARRAY = 'assign cubeIds must be an array';
export const ASSIGN_CUBE_NAMES_ARRAY = 'assign cubeNames must be an array';
export const PRESETS_MUST_BE_ARRAY = 'presets must be an array';
export const PRESET_NAME_REQUIRED = 'preset name is required';
export const UNKNOWN_TEXTURE_PRESET = (preset: string) => `unknown texture preset: ${preset}`;
export const PRESET_SIZE_POSITIVE = 'preset width/height must be positive numbers';
export const PRESET_SIZE_INTEGER = 'preset width/height must be integers';
export const PRESET_SIZE_EXCEEDS_MAX = (maxSize: number) => `preset size exceeds max ${maxSize}`;
export const PRESET_MODE_INVALID = (preset: string) => `preset mode invalid (${preset})`;
export const PRESET_UPDATE_REQUIRES_TARGET = (preset: string) =>
  `preset update requires targetId or targetName (${preset})`;
export const PREVIEW_MODE_INVALID = (mode: string) => `preview mode invalid (${mode})`;

export const UV_ASSIGNMENTS_REQUIRED = 'assignments must be a non-empty array';
export const UV_ASSIGNMENT_OBJECT_REQUIRED = 'assignment must be an object';
export const UV_ASSIGNMENT_CUBE_IDS_STRING_ARRAY = 'cubeIds must be an array of strings';
export const UV_ASSIGNMENT_CUBE_NAMES_STRING_ARRAY = 'cubeNames must be an array of strings';
export const UV_ASSIGNMENT_FACES_REQUIRED = 'faces is required for each assignment';
export const UV_ASSIGNMENT_FACES_NON_EMPTY = 'faces must include at least one mapping';
export const UV_ASSIGNMENT_INVALID_FACE = (face: string) => `invalid face: ${face}`;
export const UV_ASSIGNMENT_UV_FORMAT = (face: string) => `UV for ${face} must be [x1,y1,x2,y2]`;
export const UV_ASSIGNMENT_UV_NUMBERS = (face: string) => `UV for ${face} must contain finite numbers`;

export const UV_OVERLAP_MESSAGE = (
  names: string,
  suffix: string,
  example: string,
  plural: boolean
) =>
  `UV overlap detected for texture${plural ? 's' : ''} ${names}${suffix}. Only identical UV rects may overlap.${example}`;
export const UV_OVERLAP_FIX =
  'Adjust UVs so only identical rects overlap, then call preflight_texture and retry.';

export const UV_SCALE_MESSAGE = (
  names: string,
  suffix: string,
  example: string,
  plural: boolean
) => `UV scale mismatch detected for texture${plural ? 's' : ''} ${names}${suffix}.${example}`;
export const UV_SCALE_FIX = 'Run auto_uv_atlas (apply=true), then preflight_texture, then repaint.';

export const TEXTURE_COVERAGE_LOW_MESSAGE = (label: string, ratio: number) =>
  `Texture coverage too low for "${label}" (${ratio}% opaque).`;
export const TEXTURE_COVERAGE_LOW_FIX =
  'Fill a larger opaque area, use an opaque background, or set per-face UVs to the painted bounds.';
export const TEXTURE_COVERAGE_LOW_HINT = 'Low opaque coverage + full-face UVs yields transparent results.';

export const TEXTURE_SIZE_MISMATCH_MESSAGE = (
  name: string,
  expectedWidth: number,
  expectedHeight: number,
  actualWidth: number,
  actualHeight: number
) => `Texture size mismatch for "${name}": expected ${expectedWidth}x${expectedHeight}, got ${actualWidth}x${actualHeight}.`;
export const TEXTURE_SIZE_MISMATCH_FIX =
  'Call set_project_texture_resolution to match the target size, then recreate the texture.';

export const TEXTURE_SPECS_REQUIRED = 'textures array is required';
export const TEXTURE_SPEC_MODE_UNSUPPORTED = (mode: string, label: string) =>
  `unsupported texture mode ${mode} (${label})`;
export const TEXTURE_MODE_UNSUPPORTED = (mode: string) => `unsupported texture mode: ${mode}`;
export const TEXTURE_SPEC_NAME_REQUIRED = (label: string) => `texture name is required (${label})`;
export const TEXTURE_SPEC_TARGET_REQUIRED = (label: string) => `targetId or targetName is required (${label})`;
export const TEXTURE_DIMENSION_POSITIVE = (axis: string, label: string) => `texture ${axis} must be > 0 (${label})`;
export const TEXTURE_SIZE_EXCEEDS_MAX = (maxSize: number, label: string) =>
  `texture size exceeds max ${maxSize} (${label})`;
export const TEXTURE_OPS_TOO_MANY = (maxOps: number, label: string) =>
  `too many texture ops (>${maxOps}) (${label})`;
export const TEXTURE_OP_INVALID = (label: string) => `invalid texture op (${label})`;

export const UV_PAINT_USAGE_MISSING = (label: string) =>
  `No UV usage found for texture "${label}". Assign the texture and set per-face UVs before uvPaint.`;
export const UV_PAINT_TARGET_CUBES_NOT_FOUND = (label: string) =>
  `uvPaint target cubes not found for texture "${label}".`;
export const UV_PAINT_TARGET_FACES_NOT_FOUND = (label: string) =>
  `uvPaint target faces not found for texture "${label}".`;
export const UV_PAINT_NO_RECTS = (label: string) =>
  `No UV rects found for texture "${label}". Set per-face UVs before uvPaint.`;
export const UV_PAINT_NO_BOUNDS = (label: string) => `No UV bounds found for texture "${label}".`;
export const UV_PAINT_MAPPING_REQUIRED =
  'UV mapping is required before painting. Assign the texture and set per-face UVs, then call preflight_texture.';
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
export const UV_PAINT_PATTERN_UNAVAILABLE = (label: string) => `uvPaint pattern unavailable (${label})`;

export const TEXTURE_CANVAS_UNAVAILABLE = 'texture canvas not available';
export const TEXTURE_CANVAS_CONTEXT_UNAVAILABLE = 'texture canvas context not available';
export const UV_PAINT_CANVAS_UNAVAILABLE = 'uvPaint canvas not available';
export const UV_PAINT_CONTEXT_UNAVAILABLE = 'uvPaint canvas context not available';
export const TEXTURE_BASE_IMAGE_UNAVAILABLE = 'Texture base image unavailable';
export const TEXTURE_BASE_SIZE_UNAVAILABLE = 'Texture base size unavailable';
export const TEXTURE_OP_UNSUPPORTED = 'unsupported texture op';

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
  ` Only identical UV rects may overlap.` +
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
export const TEXTURE_UPDATE_TARGET_REQUIRED = 'targetId or targetName is required for update';
export const TEXTURE_CONTENT_UNCHANGED = 'Texture content is unchanged.';
export const TEXTURE_CONTENT_UNCHANGED_FIX = 'Adjust ops or include a rename before updating.';
export const TEXTURE_DATA_UNAVAILABLE = 'Texture data unavailable.';

export const TEXTURE_RENDERER_UNAVAILABLE = 'Texture renderer unavailable.';
export const TEXTURE_PRESET_MODE_INVALID = (mode: string) => `mode must be create or update (${mode}).`;
export const TEXTURE_PRESET_NAME_REQUIRED = 'name is required when mode=create.';
export const TEXTURE_PRESET_TARGET_REQUIRED = 'targetId or targetName is required when mode=update.';
export const TEXTURE_PRESET_UV_USAGE_REQUIRED =
  'uvUsageId is required. Call preflight_texture before generate_texture_preset.';
export const TEXTURE_PRESET_SIZE_EXCEEDS_MAX = (maxSize: number) => `Texture size exceeds max ${maxSize}.`;
export const TEXTURE_PRESET_SIZE_EXCEEDS_MAX_FIX = (maxSize: number) => `Use width/height <= ${maxSize}.`;
export const TEXTURE_RENDERER_NO_IMAGE = 'Texture renderer failed to produce an image.';
export const PREVIEW_IMAGE_DATA_UNAVAILABLE = 'Preview image data unavailable.';
export const PREVIEW_FRAMES_UNAVAILABLE = 'Preview frames unavailable.';
export const PREVIEW_FRAME_DATA_UNAVAILABLE = 'Preview frame data unavailable.';
export const TEXTURE_AUTO_UV_NO_TEXTURES = 'No textures are assigned to any cube faces.';
export const TEXTURE_AUTO_UV_UNRESOLVED_REFS = (count: number) =>
  `Unresolved texture references detected (${count}). Assign textures before atlas packing.`;
export const TEXTURE_AUTO_UV_RESOLUTION_MISSING =
  'Project textureResolution is missing. Set it before atlas packing.';

export const UV_ATLAS_RESOLUTION_POSITIVE = 'textureResolution must be positive integers.';
export const UV_ATLAS_MAX_RESOLUTION_POSITIVE = 'maxResolution must be positive integers.';
export const UV_ATLAS_EXCEEDS_MAX = 'Atlas packing exceeded max texture resolution.';
export const UV_ATLAS_CUBE_MISSING = (name: string) => `Cube "${name}" not found in project snapshot.`;
export const UV_ATLAS_DERIVE_SIZE_FAILED = (cube: string, face: string) =>
  `Unable to derive UV size for ${cube} (${face}).`;
export const UV_ATLAS_UV_SIZE_EXCEEDS = (cube: string, face: string) =>
  `UV size exceeds texture resolution for ${cube} (${face}).`;
export const UV_ATLAS_OVERFLOW = 'Atlas packing overflow.';

export const UV_BOUNDS_NEGATIVE = 'Face UV coordinates must be non-negative.';
export const UV_BOUNDS_OUT_OF_BOUNDS = (width: number, height: number) =>
  `Face UV is outside texture resolution ${width}x${height}.`;
export const UV_BOUNDS_ORDER = 'Face UV coordinates must satisfy x2 >= x1 and y2 >= y1.';

export const UV_USAGE_REQUIRED = 'uvUsageId is required. Call preflight_texture before continuing.';

export const UV_PAINT_SOURCE_AXIS_POSITIVE = (axis: string, label: string) =>
  `uvPaint source ${axis} must be > 0 (${label})`;
export const UV_PAINT_SOURCE_AXIS_INTEGER = (axis: string, label: string) =>
  `uvPaint source ${axis} must be an integer (${label})`;
