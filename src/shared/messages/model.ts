export const MODEL_REQUIRED = 'model is required';
export const MODEL_MODE_INVALID = (mode: string) => `unsupported mode: ${mode}`;
export const PLAN_ONLY_BOOLEAN = 'planOnly must be a boolean';
export const PLAN_ONLY_NO_ENSURE = 'planOnly cannot be combined with ensureProject';
export const PLAN_ONLY_NO_EXTRAS = 'planOnly cannot be combined with preview/validate/export';
export const TOO_MANY_CUBES = (count: number, max: number) => `too many cubes (${count} > ${max})`;

export const MODEL_SPEC_REQUIRED = 'model is required';
export const MODEL_SPEC_ANCHORS_ARRAY = 'anchors must be an array';
export const MODEL_SPEC_BONES_ARRAY = 'bones must be an array';
export const MODEL_SPEC_CUBES_ARRAY = 'cubes must be an array';
export const MODEL_SPEC_INSTANCES_ARRAY = 'instances must be an array';
export const MODEL_SPEC_ANCHOR_OBJECT = 'anchor entry must be an object';
export const MODEL_SPEC_ANCHOR_ID_REQUIRED = 'anchor id is required';
export const MODEL_SPEC_ANCHOR_ID_DUPLICATE = (id: string) => `duplicate anchor id: ${id}`;
export const MODEL_SPEC_ANCHOR_TARGET_INVALID = (id: string) =>
  `anchor target must include exactly one of boneId or cubeId (${id})`;
export const MODEL_SPEC_ANCHOR_BONE_ID_INVALID = (id: string) => `anchor boneId must be a string (${id})`;
export const MODEL_SPEC_ANCHOR_CUBE_ID_INVALID = (id: string) => `anchor cubeId must be a string (${id})`;
export const MODEL_SPEC_ANCHOR_OFFSET_INVALID = (id: string) => `anchor offset must be [x,y,z] (${id})`;
export const MODEL_SPEC_ANCHOR_REF_STRING = (label: string) => `${label} must be a string`;
export const MODEL_SPEC_ANCHOR_REQUIRED = (label: string) => `${label} requires anchors`;
export const MODEL_SPEC_ANCHOR_NOT_FOUND = (id: string) => `anchor not found: ${id}`;

export const MODEL_ANCHORS_REQUIRED_FOR_IDS = 'anchors are required when using anchor ids';
export const MODEL_ANCHOR_CYCLE_DETECTED = (kind: string, id: string) =>
  `anchor cycle detected at ${kind} ${id}`;
export const MODEL_ANCHOR_NOT_FOUND = (id: string) => `anchor not found: ${id}`;
export const MODEL_ANCHOR_BONE_NOT_FOUND = (id: string) => `anchor bone not found: ${id}`;
export const MODEL_ANCHOR_CUBE_NOT_FOUND = (id: string) => `anchor cube not found: ${id}`;

export const MODEL_INSTANCE_OBJECT_REQUIRED = 'instance entry must be an object';
export const MODEL_INSTANCE_MIRROR_SOURCE_MISSING = (id: string) => `mirror source cube not found: ${id}`;
export const MODEL_INSTANCE_REPEAT_SOURCE_MISSING = (id: string) => `repeat source cube not found: ${id}`;
export const MODEL_INSTANCE_RADIAL_SOURCE_MISSING = (id: string) => `radial source cube not found: ${id}`;
export const MODEL_INSTANCE_REPEAT_COUNT_INVALID = 'repeat.count must be > 0';
export const MODEL_INSTANCE_RADIAL_COUNT_INVALID = 'radial.count must be > 1';
export const MODEL_INSTANCE_UNKNOWN = (type: string) => `Unknown instance type: ${type}`;
export const MODEL_BONE_ID_REQUIRED_EXPLICIT = 'bone id is required when idPolicy=explicit';
export const MODEL_BONE_ID_REQUIRED_EXPLICIT_FIX =
  'Provide bone ids, or set model.policies.idPolicy to "stable_path" or "hash" to auto-generate ids.';
export const MODEL_CUBE_ID_REQUIRED_EXPLICIT = 'cube id is required when idPolicy=explicit';
export const MODEL_CUBE_ID_REQUIRED_EXPLICIT_FIX =
  'Provide cube ids, or set model.policies.idPolicy to "stable_path" or "hash" to auto-generate ids.';
export const MODEL_CUBE_BOUNDS_MISSING = (label: string) => `cube bounds missing for ${label}`;
export const MODEL_DUPLICATE_BONE_ID = (id: string) => `duplicate bone id: ${id}`;
export const MODEL_DUPLICATE_BONE_NAME = (name: string) => `duplicate bone name: ${name}`;
export const MODEL_DUPLICATE_CUBE_ID = (id: string) => `duplicate cube id: ${id}`;
export const MODEL_DUPLICATE_CUBE_NAME = (name: string) => `duplicate cube name: ${name}`;
export const MODEL_BONE_PARENT_MISSING = (id: string) => `bone parent not found: ${id}`;
export const MODEL_CUBE_PARENT_BONE_MISSING = (id: string) => `cube parent bone not found: ${id}`;

export const MODEL_PLAN_BONE_NOT_FOUND = (name: string) => `bone not found for patch: ${name}`;
export const MODEL_PLAN_BONE_EXISTS = (name: string) => `bone already exists: ${name}`;
export const MODEL_PLAN_CUBE_NOT_FOUND = (name: string) => `cube not found for patch: ${name}`;
export const MODEL_PLAN_CUBE_EXISTS = (name: string) => `cube already exists: ${name}`;

export const MODEL_BONE_NAME_REQUIRED = 'Bone name is required';
export const MODEL_BONE_NAME_REQUIRED_FIX = 'Provide a non-empty bone name.';
export const MODEL_PARENT_BONE_NOT_FOUND = (label: string) => `Parent bone not found: ${label}`;
export const MODEL_BONE_EXISTS = (name: string) => `Bone already exists: ${name}`;
export const MODEL_BONE_ID_EXISTS = (id: string) => `Bone id already exists: ${id}`;
export const MODEL_BONE_ID_OR_NAME_REQUIRED = 'Bone id or name is required';
export const MODEL_BONE_NOT_FOUND = (label: string) => `Bone not found: ${label}`;
export const MODEL_BONE_SELF_PARENT = 'Bone cannot be parented to itself';
export const MODEL_BONE_DESCENDANT_PARENT = 'Bone cannot be parented to its descendant';
export const MODEL_CUBE_NAME_REQUIRED = 'Cube name is required';
export const MODEL_CUBE_NAME_REQUIRED_FIX = 'Provide a non-empty cube name.';
export const MODEL_CUBE_BONE_REQUIRED = 'Cube bone is required';
export const MODEL_CUBE_BONE_REQUIRED_FIX = 'Provide bone or boneId to attach the cube.';
export const MODEL_CUBE_EXISTS = (name: string) => `Cube already exists: ${name}`;
export const MODEL_CUBE_ID_EXISTS = (id: string) => `Cube id already exists: ${id}`;
export const MODEL_CUBE_ID_OR_NAME_REQUIRED = 'Cube id or name is required';
export const MODEL_CUBE_NOT_FOUND = (label: string) => `Cube not found: ${label}`;
export const MODEL_CUBE_LIMIT_EXCEEDED = (limit: number) => `Cube limit exceeded (${limit})`;
