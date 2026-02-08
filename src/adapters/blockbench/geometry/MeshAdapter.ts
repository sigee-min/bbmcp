import type { ToolError } from '../../../types/internal';
import type { Logger } from '../../../logging';
import type {
  DeleteMeshCommand,
  MeshCommand,
  MeshFaceCommand,
  MeshFaceUvCommand,
  MeshVertexCommand,
  UpdateMeshCommand
} from '../../../ports/editor';
import {
  assignVec3,
  attachToOutliner,
  extendEntity,
  moveOutlinerNode,
  normalizeParent,
  removeOutlinerNode,
  renameEntity,
  setVisibility,
  withUndo
} from '../blockbenchUtils';
import { getMeshApi } from '../blockbenchAdapterUtils';
import { findGroup, findMeshRef } from '../outlinerLookup';
import { withToolErrorAdapterError } from '../adapterErrors';
import { MODEL_BONE_NOT_FOUND, MODEL_MESH_NOT_FOUND } from '../../../shared/messages';

type MeshPatch = {
  vertices?: MeshVertexCommand[];
  faces?: MeshFaceCommand[];
};

type NormalizedMeshPatch = {
  vertices?: Record<string, [number, number, number]>;
  faces?: Record<string, Record<string, unknown>>;
};

export class BlockbenchMeshAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  addMesh(params: MeshCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'mesh add', 'mesh add failed', () => {
      const api = getMeshApi();
      if ('error' in api) return api.error;
      const { MeshCtor, outliner } = api;
      withUndo({ elements: true, outliner: true }, 'Add mesh', () => {
        const parent = normalizeParent(findGroup(params.bone));
        const created = new MeshCtor({
          name: params.name,
          origin: params.origin,
          rotation: params.rotation
        });
        const mesh = (created.init?.() as typeof created | void) ?? created;
        applyMeshPatch(mesh as Record<string, unknown>, {
          vertices: params.vertices,
          faces: params.faces
        });
        setVisibility(mesh, params.visibility);
        if (params.id) mesh.bbmcpId = params.id;
        const attached = attachToOutliner(parent, outliner, mesh, this.log, 'mesh');
        if (!attached && Array.isArray(outliner?.root)) {
          outliner.root.push(mesh);
        }
      });
      this.log.info('mesh added', { name: params.name, bone: params.bone });
      return null;
    });
  }

  updateMesh(params: UpdateMeshCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'mesh update', 'mesh update failed', () => {
      const api = getMeshApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findMeshRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_MESH_NOT_FOUND(label) };
      }
      if (params.id) {
        target.bbmcpId = params.id;
      }
      const parent = params.boneRoot ? null : params.bone ? findGroup(params.bone) : undefined;
      if (params.bone && !parent) {
        return { code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(params.bone) };
      }
      withUndo({ elements: true, outliner: true }, 'Update mesh', () => {
        if (params.newName && params.newName !== target.name) {
          renameEntity(target, params.newName);
        }
        if (params.origin) assignVec3(target, 'origin', params.origin);
        if (params.rotation) assignVec3(target, 'rotation', params.rotation);
        setVisibility(target, params.visibility);
        applyMeshPatch(target as Record<string, unknown>, {
          vertices: params.vertices,
          faces: params.faces
        });
        if (params.boneRoot || params.bone !== undefined) {
          moveOutlinerNode(target, parent ?? null, outliner, this.log, 'mesh');
        }
      });
      this.log.info('mesh updated', { name: params.name, newName: params.newName, bone: params.bone });
      return null;
    });
  }

  deleteMesh(params: DeleteMeshCommand): ToolError | null {
    return withToolErrorAdapterError(this.log, 'mesh delete', 'mesh delete failed', () => {
      const api = getMeshApi();
      if ('error' in api) return api.error;
      const { outliner } = api;
      const target = findMeshRef(params.name, params.id);
      if (!target) {
        const label = params.id ?? params.name ?? 'unknown';
        return { code: 'invalid_payload', message: MODEL_MESH_NOT_FOUND(label) };
      }
      withUndo({ elements: true, outliner: true }, 'Delete mesh', () => {
        removeOutlinerNode(target, outliner);
      });
      this.log.info('mesh deleted', { name: target?.name ?? params.name });
      return null;
    });
  }
}

const applyMeshPatch = (mesh: Record<string, unknown>, patch: MeshPatch): void => {
  const normalized = normalizeMeshPatch(patch);
  if (!normalized) return;
  const extended = extendEntity(mesh, normalized);
  if (!extended) {
    if (normalized.vertices) {
      (mesh as { vertices?: Record<string, [number, number, number]> }).vertices = normalized.vertices;
    }
    if (normalized.faces) {
      (mesh as { faces?: Record<string, Record<string, unknown>> }).faces = normalized.faces;
    }
  }
};

const normalizeMeshPatch = (patch: MeshPatch): NormalizedMeshPatch | null => {
  const normalized: NormalizedMeshPatch = {};
  if (patch.vertices) {
    normalized.vertices = toVertexRecord(patch.vertices);
  }
  if (patch.faces) {
    normalized.faces = toFaceRecord(patch.faces);
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
};

const toVertexRecord = (vertices: MeshVertexCommand[]): Record<string, [number, number, number]> => {
  const record: Record<string, [number, number, number]> = {};
  for (const vertex of vertices) {
    record[vertex.id] = [vertex.pos[0], vertex.pos[1], vertex.pos[2]];
  }
  return record;
};

const toFaceRecord = (faces: MeshFaceCommand[]): Record<string, Record<string, unknown>> => {
  const record: Record<string, Record<string, unknown>> = {};
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index];
    const faceId = face.id ?? `f${index}`;
    const next: Record<string, unknown> = {
      vertices: [...face.vertices]
    };
    const uv = toFaceUvRecord(face.uv);
    if (uv) next.uv = uv;
    if (typeof face.texture === 'string' || face.texture === false) {
      next.texture = face.texture;
    }
    record[faceId] = next;
  }
  return record;
};

const toFaceUvRecord = (uv: MeshFaceUvCommand[] | undefined): Record<string, [number, number]> | undefined => {
  if (!uv || uv.length === 0) return undefined;
  const record: Record<string, [number, number]> = {};
  for (const point of uv) {
    record[point.vertexId] = [point.uv[0], point.uv[1]];
  }
  return record;
};
