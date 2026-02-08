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

export const MODEL_MESH_NAME_REQUIRED = 'Mesh name is required';
export const MODEL_MESH_NAME_REQUIRED_FIX = 'Provide a non-empty mesh name.';
export const MODEL_MESH_UNSUPPORTED_FORMAT = 'Mesh tools are not supported by the active format.';
export const MODEL_MESH_EXISTS = (name: string) => `Mesh already exists: ${name}`;
export const MODEL_MESH_ID_EXISTS = (id: string) => `Mesh id already exists: ${id}`;
export const MODEL_MESH_ID_OR_NAME_REQUIRED = 'Mesh id or name is required';
export const MODEL_MESH_NOT_FOUND = (label: string) => `Mesh not found: ${label}`;
export const MODEL_MESH_VERTICES_REQUIRED = 'Mesh requires at least 3 vertices.';
export const MODEL_MESH_FACES_REQUIRED = 'Mesh requires at least 1 face.';
export const MODEL_MESH_VERTEX_ID_REQUIRED = 'Mesh vertex id is required.';
export const MODEL_MESH_VERTEX_ID_DUPLICATE = (id: string) => `Mesh vertex id must be unique: ${id}`;
export const MODEL_MESH_VERTEX_POS_INVALID = (id: string) => `Mesh vertex has invalid coordinates: ${id}`;
export const MODEL_MESH_FACE_VERTICES_REQUIRED = 'Mesh face requires at least 3 vertex ids.';
export const MODEL_MESH_FACE_VERTEX_UNKNOWN = (vertexId: string) =>
  `Mesh face references unknown vertex id: ${vertexId}`;
export const MODEL_MESH_FACE_UV_VERTEX_UNKNOWN = (vertexId: string) =>
  `Mesh face uv references unknown vertex id: ${vertexId}`;
export const MODEL_MESH_FACE_DEGENERATE = (faceId: string) =>
  `Mesh face has near-zero area and cannot be mapped safely: ${faceId}`;
export const MODEL_MESH_FACE_UV_AUTO_ONLY = 'Mesh UV is auto-generated. Remove face.uv inputs and retry.';
