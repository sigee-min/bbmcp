import type { ToolError } from '@ashfox/contracts/types/internal';
import type { EditorPort } from '../../ports/editor';
import type { ProjectSession, SessionState } from '../../session';
import { ok, fail, type UsecaseResult } from '../result';
import { withActiveAndRevision } from '../guards';
import { resolveBoneNameById } from '../../domain/sessionLookup';
import { resolveMeshTarget } from '../targetResolvers';
import { autoMapMeshUv, normalizeMeshUvPolicy, type MeshUvPolicy } from '../../domain/mesh/autoUv';
import {
  MODEL_BONE_NOT_FOUND,
  MODEL_MESH_EXISTS,
  MODEL_MESH_FACE_UV_AUTO_ONLY,
  MODEL_MESH_FACE_DEGENERATE,
  MODEL_MESH_FACE_UV_VERTEX_UNKNOWN,
  MODEL_MESH_FACE_VERTEX_UNKNOWN,
  MODEL_MESH_FACE_VERTICES_REQUIRED,
  MODEL_MESH_FACES_REQUIRED,
  MODEL_MESH_ID_EXISTS,
  MODEL_MESH_ID_OR_NAME_REQUIRED,
  MODEL_MESH_NAME_REQUIRED,
  MODEL_MESH_NAME_REQUIRED_FIX,
  MODEL_MESH_NOT_FOUND,
  MODEL_MESH_VERTEX_ID_DUPLICATE,
  MODEL_MESH_VERTEX_ID_REQUIRED,
  MODEL_MESH_VERTEX_POS_INVALID,
  MODEL_MESH_VERTICES_REQUIRED
} from '../../shared/messages';
import { ensureNonBlankFields } from './validators';
import { ensureIdAvailable, ensureNameAvailable, ensureRenameAvailable, resolveEntityId } from '../crudChecks';
import { resolveTargets } from '../targetSelectors';
import { buildIdNameMismatchMessage } from '../../shared/targetMessages';

type MeshVertexInput = { id: string; pos: [number, number, number] };
type MeshFaceUvInput = { vertexId: string; uv: [number, number] };
type MeshFaceInput = { id?: string; vertices: string[]; uv?: MeshFaceUvInput[]; texture?: string | false };
type AutoMappedMesh = { faces: MeshFaceInput[]; policy: Required<MeshUvPolicy> };

export interface MeshServiceDeps {
  session: ProjectSession;
  editor: EditorPort;
  getSnapshot: () => SessionState;
  ensureActive: () => ToolError | null;
  ensureRevisionMatch: (ifRevision?: string) => ToolError | null;
}

export class MeshService {
  private readonly session: ProjectSession;
  private readonly editor: EditorPort;
  private readonly getSnapshot: () => SessionState;
  private readonly ensureActive: () => ToolError | null;
  private readonly ensureRevisionMatch: (ifRevision?: string) => ToolError | null;

  constructor(deps: MeshServiceDeps) {
    this.session = deps.session;
    this.editor = deps.editor;
    this.getSnapshot = deps.getSnapshot;
    this.ensureActive = deps.ensureActive;
    this.ensureRevisionMatch = deps.ensureRevisionMatch;
  }

  addMesh(payload: {
    id?: string;
    name: string;
    bone?: string;
    boneId?: string;
    origin?: [number, number, number];
    rotation?: [number, number, number];
    visibility?: boolean;
    uvPolicy?: MeshUvPolicy;
    vertices: MeshVertexInput[];
    faces: MeshFaceInput[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        if (!payload.name) {
          return fail({
            code: 'invalid_payload',
            message: MODEL_MESH_NAME_REQUIRED,
            fix: MODEL_MESH_NAME_REQUIRED_FIX
          });
        }
        const blankErr = ensureNonBlankFields([
          [payload.name, 'Mesh name'],
          [payload.bone, 'Mesh bone'],
          [payload.boneId, 'Mesh boneId']
        ]);
        if (blankErr) return fail(blankErr);
        if (hasFaceUvInput(payload.faces)) {
          return fail({ code: 'invalid_payload', message: MODEL_MESH_FACE_UV_AUTO_ONLY });
        }
        const geometryErr = validateMeshGeometry(payload.vertices, payload.faces);
        if (geometryErr) return fail(geometryErr);

        const meshes = snapshot.meshes ?? [];
        const nameErr = ensureNameAvailable(meshes, payload.name, MODEL_MESH_EXISTS);
        if (nameErr) return fail(nameErr);
        const id = resolveEntityId(undefined, payload.id, 'mesh');
        const idErr = ensureIdAvailable(meshes, id, MODEL_MESH_ID_EXISTS);
        if (idErr) return fail(idErr);

        const boneRes = this.resolveMeshBone(snapshot, { bone: payload.bone, boneId: payload.boneId });
        if (!boneRes.ok) return fail(boneRes.error);
        const mapped = this.autoMapUv(snapshot, payload.vertices, payload.faces, payload.uvPolicy);
        const uvPolicy = mapped.policy;
        const facesWithUv = mapped.faces;

        const err = this.editor.addMesh({
          id,
          name: payload.name,
          bone: boneRes.value,
          origin: payload.origin,
          rotation: payload.rotation,
          visibility: payload.visibility,
          vertices: payload.vertices,
          faces: facesWithUv
        });
        if (err) return fail(err);

        this.session.addMesh({
          id,
          name: payload.name,
          bone: boneRes.value,
          origin: payload.origin,
          rotation: payload.rotation,
          visibility: payload.visibility,
          uvPolicy,
          vertices: payload.vertices,
          faces: facesWithUv
        });
        return ok({ id, name: payload.name });
      }
    );
  }

  updateMesh(payload: {
    id?: string;
    name?: string;
    newName?: string;
    bone?: string;
    boneId?: string;
    boneRoot?: boolean;
    origin?: [number, number, number];
    rotation?: [number, number, number];
    visibility?: boolean;
    uvPolicy?: MeshUvPolicy;
    vertices?: MeshVertexInput[];
    faces?: MeshFaceInput[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const blankErr = ensureNonBlankFields([
          [payload.id, 'Mesh id'],
          [payload.name, 'Mesh name'],
          [payload.newName, 'Mesh newName'],
          [payload.bone, 'Mesh bone'],
          [payload.boneId, 'Mesh boneId']
        ]);
        if (blankErr) return fail(blankErr);
        if (hasFaceUvInput(payload.faces)) {
          return fail({ code: 'invalid_payload', message: MODEL_MESH_FACE_UV_AUTO_ONLY });
        }

        const meshes = snapshot.meshes ?? [];
        const resolved = resolveMeshTarget(meshes, payload.id, payload.name);
        if (resolved.error) return fail(resolved.error);
        const target = resolved.target!;
        const targetName = target.name;
        const targetId = resolveEntityId(target.id, payload.id, 'mesh');
        const renameErr = ensureRenameAvailable(meshes, payload.newName, targetName, MODEL_MESH_EXISTS);
        if (renameErr) return fail(renameErr);

        const boneRes = this.resolveMeshBoneUpdate(snapshot, {
          boneRoot: payload.boneRoot,
          bone: payload.bone,
          boneId: payload.boneId
        });
        if (!boneRes.ok) return fail(boneRes.error);
        const boneUpdate = boneRes.value;
        const nextUvPolicy = payload.uvPolicy ?? target.uvPolicy;

        const nextVertices = payload.vertices ?? target.vertices;
        const faceGeometry = stripUvFromFaces(payload.faces ?? target.faces);
        const geometryErr = validateMeshGeometry(nextVertices, faceGeometry);
        if (geometryErr) return fail(geometryErr);
        const shouldRemapUv = Boolean(payload.vertices || payload.faces || payload.uvPolicy || !hasCompleteFaceUv(target.faces));
        const mapped = shouldRemapUv ? this.autoMapUv(snapshot, nextVertices, faceGeometry!, nextUvPolicy) : null;
        const mappedFaces = mapped?.faces ?? target.faces;
        const uvPolicy = mapped?.policy ?? normalizeMeshUvPolicy(nextUvPolicy);

        const err = this.editor.updateMesh({
          id: targetId,
          name: targetName,
          newName: payload.newName,
          bone: payload.boneRoot ? null : typeof boneUpdate === 'string' ? boneUpdate : undefined,
          boneRoot: payload.boneRoot,
          origin: payload.origin,
          rotation: payload.rotation,
          visibility: payload.visibility,
          vertices: payload.vertices,
          faces: shouldRemapUv ? mappedFaces : undefined
        });
        if (err) return fail(err);

        this.session.updateMesh(targetName, {
          id: targetId,
          newName: payload.newName,
          bone: boneUpdate,
          origin: payload.origin,
          rotation: payload.rotation,
          visibility: payload.visibility,
          uvPolicy,
          ...(payload.vertices ? { vertices: payload.vertices } : {}),
          ...(shouldRemapUv ? { faces: mappedFaces } : {})
        });
        return ok({ id: targetId, name: payload.newName ?? targetName });
      }
    );
  }

  deleteMesh(payload: {
    id?: string;
    name?: string;
    ids?: string[];
    names?: string[];
    ifRevision?: string;
  }): UsecaseResult<{ id: string; name: string; deleted: Array<{ id?: string; name: string }> }> {
    return withActiveAndRevision(
      this.ensureActive,
      this.ensureRevisionMatch,
      payload.ifRevision,
      () => {
        const snapshot = this.getSnapshot();
        const meshes = snapshot.meshes ?? [];
        const resolvedTargets = resolveTargets(
          meshes,
          payload,
          { id: 'Mesh id', name: 'Mesh name' },
          { message: MODEL_MESH_ID_OR_NAME_REQUIRED },
          {
            required: { message: MODEL_MESH_ID_OR_NAME_REQUIRED },
            mismatch: { kind: 'Mesh', plural: 'meshes', message: buildIdNameMismatchMessage },
            notFound: MODEL_MESH_NOT_FOUND
          }
        );
        if (!resolvedTargets.ok) return fail(resolvedTargets.error);

        const targets = resolvedTargets.value;
        for (const target of targets) {
          const err = this.editor.deleteMesh({ id: target.id ?? undefined, name: target.name });
          if (err) return fail(err);
        }
        const nameSet = new Set(targets.map((target) => target.name));
        this.session.removeMeshes(nameSet);

        const deleted = targets.map((target) => ({ id: target.id ?? undefined, name: target.name }));
        const primary = deleted[0] ?? { id: targets[0]?.id ?? undefined, name: targets[0]?.name ?? 'unknown' };
        return ok({ id: primary.id ?? primary.name, name: primary.name, deleted });
      }
    );
  }

  private autoMapUv(
    snapshot: SessionState,
    vertices: MeshVertexInput[],
    faces: MeshFaceInput[],
    policy?: MeshUvPolicy
  ): AutoMappedMesh {
    const resolution = resolveMeshUvResolution(this.editor.getProjectTextureResolution(), snapshot);
    return autoMapMeshUv({
      vertices,
      faces,
      textureWidth: resolution.width,
      textureHeight: resolution.height,
      policy
    });
  }

  private resolveMeshBone(
    snapshot: SessionState,
    payload: { bone?: string; boneId?: string }
  ): UsecaseResult<string | undefined> {
    const hasExplicit = payload.boneId !== undefined || payload.bone !== undefined;
    if (hasExplicit) {
      const boneName = payload.boneId ? resolveBoneNameById(snapshot.bones, payload.boneId) : payload.bone;
      if (payload.boneId && !boneName) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(payload.boneId) });
      }
      if (boneName && !snapshot.bones.some((bone) => bone.name === boneName)) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(boneName) });
      }
      return ok(boneName ?? undefined);
    }
    if (snapshot.bones.some((bone) => bone.name === 'root')) return ok('root');
    return ok(undefined);
  }

  private resolveMeshBoneUpdate(
    snapshot: SessionState,
    payload: { boneRoot?: boolean; bone?: string; boneId?: string }
  ): UsecaseResult<string | null | undefined> {
    const boneUpdateRaw =
      payload.boneRoot
        ? null
        : payload.boneId
          ? resolveBoneNameById(snapshot.bones, payload.boneId)
          : payload.bone !== undefined
            ? payload.bone
            : undefined;
    if (payload.boneId && !boneUpdateRaw) {
      return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(payload.boneId) });
    }
    if (typeof boneUpdateRaw === 'string') {
      const exists = snapshot.bones.some((bone) => bone.name === boneUpdateRaw);
      if (!exists) {
        return fail({ code: 'invalid_payload', message: MODEL_BONE_NOT_FOUND(boneUpdateRaw) });
      }
    }
    return ok(boneUpdateRaw ?? undefined);
  }
}

const validateMeshGeometry = (
  vertices: MeshVertexInput[] | undefined,
  faces: MeshFaceInput[] | undefined
): ToolError | null => {
  if (!vertices || vertices.length < 3) {
    return { code: 'invalid_payload', message: MODEL_MESH_VERTICES_REQUIRED };
  }
  if (!faces || faces.length < 1) {
    return { code: 'invalid_payload', message: MODEL_MESH_FACES_REQUIRED };
  }

  const vertexIds = new Set<string>();
  for (const vertex of vertices) {
    const id = String(vertex.id ?? '').trim();
    if (!id) {
      return { code: 'invalid_payload', message: MODEL_MESH_VERTEX_ID_REQUIRED };
    }
    if (
      !Number.isFinite(vertex.pos[0]) ||
      !Number.isFinite(vertex.pos[1]) ||
      !Number.isFinite(vertex.pos[2])
    ) {
      return { code: 'invalid_payload', message: MODEL_MESH_VERTEX_POS_INVALID(id) };
    }
    if (vertexIds.has(id)) {
      return { code: 'invalid_payload', message: MODEL_MESH_VERTEX_ID_DUPLICATE(id) };
    }
    vertexIds.add(id);
  }

  const vertexMap = new Map(vertices.map((vertex) => [String(vertex.id).trim(), vertex.pos] as const));

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex];
    const faceId = resolveFaceId(face.id, faceIndex);
    if (!Array.isArray(face.vertices) || face.vertices.length < 3) {
      return { code: 'invalid_payload', message: MODEL_MESH_FACE_VERTICES_REQUIRED };
    }
    if (new Set(face.vertices).size < 3) {
      return { code: 'invalid_payload', message: MODEL_MESH_FACE_VERTICES_REQUIRED };
    }
    const polygon: [number, number, number][] = [];
    for (const vertexId of face.vertices) {
      if (!vertexIds.has(vertexId)) {
        return { code: 'invalid_payload', message: MODEL_MESH_FACE_VERTEX_UNKNOWN(vertexId) };
      }
      polygon.push(vertexMap.get(vertexId)!);
    }
    if (polygonArea(polygon) <= 1e-6) {
      return { code: 'invalid_payload', message: MODEL_MESH_FACE_DEGENERATE(faceId) };
    }
    for (const point of face.uv ?? []) {
      if (!vertexIds.has(point.vertexId)) {
        return { code: 'invalid_payload', message: MODEL_MESH_FACE_UV_VERTEX_UNKNOWN(point.vertexId) };
      }
    }
  }
  return null;
};

const hasFaceUvInput = (faces: MeshFaceInput[] | undefined): boolean =>
  Array.isArray(faces) && faces.some((face) => Array.isArray(face.uv) && face.uv.length > 0);

const stripUvFromFaces = (faces: MeshFaceInput[] | undefined): MeshFaceInput[] | undefined =>
  faces?.map((face) => ({
    ...(face.id ? { id: face.id } : {}),
    vertices: [...face.vertices],
    ...(Object.prototype.hasOwnProperty.call(face, 'texture') ? { texture: face.texture } : {})
  }));

const hasCompleteFaceUv = (faces: MeshFaceInput[] | undefined): boolean => {
  if (!Array.isArray(faces) || faces.length === 0) return false;
  for (const face of faces) {
    if (!Array.isArray(face.vertices) || face.vertices.length < 3) return false;
    if (!Array.isArray(face.uv) || face.uv.length < face.vertices.length) return false;
    const uvVertexIds = new Set(face.uv.map((entry) => entry.vertexId));
    for (const vertexId of face.vertices) {
      if (!uvVertexIds.has(vertexId)) return false;
    }
  }
  return true;
};

const resolveMeshUvResolution = (
  editorResolution: { width: number; height: number } | null,
  snapshot: SessionState
): { width: number; height: number } => {
  const fallbackWidth = 64;
  const fallbackHeight = 64;
  const snapshotTexture = snapshot.textures.find((texture) => texture.width && texture.height);
  const width =
    normalizeDimension(editorResolution?.width)
    ?? normalizeDimension(snapshotTexture?.width)
    ?? fallbackWidth;
  const height =
    normalizeDimension(editorResolution?.height)
    ?? normalizeDimension(snapshotTexture?.height)
    ?? fallbackHeight;
  return { width, height };
};

const normalizeDimension = (value: unknown): number | null => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.trunc(numeric));
};

const resolveFaceId = (faceId: string | undefined, index: number): string => {
  const normalized = String(faceId ?? '').trim();
  return normalized.length > 0 ? normalized : `face_${index}`;
};

const polygonArea = (vertices: [number, number, number][]): number => {
  const origin = vertices[0];
  let area = 0;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const ax = vertices[i][0] - origin[0];
    const ay = vertices[i][1] - origin[1];
    const az = vertices[i][2] - origin[2];
    const bx = vertices[i + 1][0] - origin[0];
    const by = vertices[i + 1][1] - origin[1];
    const bz = vertices[i + 1][2] - origin[2];
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
  }
  return area;
};
