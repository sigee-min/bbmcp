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
export const MODEL_CUBE_EXISTS = (name: string) => `Cube already exists: ${name}`;
export const MODEL_CUBE_ID_EXISTS = (id: string) => `Cube id already exists: ${id}`;
export const MODEL_CUBE_ID_OR_NAME_REQUIRED = 'Cube id or name is required';
export const MODEL_CUBE_NOT_FOUND = (label: string) => `Cube not found: ${label}`;
export const MODEL_CUBE_LIMIT_EXCEEDED = (limit: number) => `Cube limit exceeded (${limit})`;
