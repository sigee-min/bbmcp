import type { Snapshot, ValidationFinding } from '../model';
import type { ValidationMessages } from './types';
import { findDuplicates } from './geometry';

const AREA_EPSILON = 1e-6;

type Vec3 = [number, number, number];

export const collectMeshFindings = (
  state: Snapshot,
  messages: ValidationMessages
): ValidationFinding[] => {
  const findings: ValidationFinding[] = [];
  const meshes = state.meshes ?? [];

  findDuplicates(meshes.map((mesh) => mesh.name)).forEach((name) => {
    findings.push({ code: 'duplicate_mesh', message: messages.duplicateMesh(name), severity: 'error' });
  });

  meshes.forEach((mesh) => {
    const verticesById = new Map<string, Vec3>();
    mesh.vertices.forEach((vertex) => {
      const id = String(vertex.id ?? '').trim();
      if (!id || !isFiniteVec3(vertex.pos)) {
        findings.push({
          code: 'mesh_vertex_invalid',
          message: messages.meshVertexInvalid(mesh.name, id || '(empty)'),
          severity: 'error'
        });
        return;
      }
      if (verticesById.has(id)) {
        findings.push({
          code: 'mesh_vertex_duplicate',
          message: messages.meshVertexDuplicate(mesh.name, id),
          severity: 'error'
        });
        return;
      }
      verticesById.set(id, [vertex.pos[0], vertex.pos[1], vertex.pos[2]]);
    });

    mesh.faces.forEach((face, index) => {
      const faceId = resolveFaceId(face.id, index);
      if (!Array.isArray(face.vertices) || face.vertices.length < 3) {
        findings.push({
          code: 'mesh_face_vertices_invalid',
          message: messages.meshFaceVerticesInvalid(mesh.name, faceId),
          severity: 'error'
        });
        return;
      }

      const uniqueVertexIds = new Set(face.vertices);
      if (uniqueVertexIds.size < 3) {
        findings.push({
          code: 'mesh_face_vertices_invalid',
          message: messages.meshFaceVerticesInvalid(mesh.name, faceId),
          severity: 'error'
        });
      }

      const polygon: Vec3[] = [];
      face.vertices.forEach((vertexId) => {
        const vertex = verticesById.get(vertexId);
        if (!vertex) {
          findings.push({
            code: 'mesh_face_vertex_unknown',
            message: messages.meshFaceVertexUnknown(mesh.name, faceId, vertexId),
            severity: 'error'
          });
          return;
        }
        polygon.push(vertex);
      });

      if (polygon.length >= 3 && polygonArea(polygon) <= AREA_EPSILON) {
        findings.push({
          code: 'mesh_face_degenerate',
          message: messages.meshFaceDegenerate(mesh.name, faceId),
          severity: 'error'
        });
      }

      face.uv?.forEach((uv) => {
        if (!verticesById.has(uv.vertexId)) {
          findings.push({
            code: 'mesh_face_uv_vertex_unknown',
            message: messages.meshFaceUvVertexUnknown(mesh.name, faceId, uv.vertexId),
            severity: 'error'
          });
        }
        if (!Number.isFinite(uv.uv[0]) || !Number.isFinite(uv.uv[1])) {
          findings.push({
            code: 'mesh_face_uv_invalid',
            message: messages.meshFaceUvInvalid(mesh.name, faceId, uv.vertexId),
            severity: 'error'
          });
        }
      });
    });
  });

  return findings;
};

const resolveFaceId = (faceId: string | undefined, index: number): string => {
  const normalized = String(faceId ?? '').trim();
  return normalized.length > 0 ? normalized : `face_${index}`;
};

const isFiniteVec3 = (value: Vec3): boolean =>
  Number.isFinite(value[0]) && Number.isFinite(value[1]) && Number.isFinite(value[2]);

const polygonArea = (vertices: Vec3[]): number => {
  const origin = vertices[0];
  let area = 0;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const a = subtract(vertices[i], origin);
    const b = subtract(vertices[i + 1], origin);
    const cross = crossProduct(a, b);
    area += Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2) * 0.5;
  }
  return area;
};

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const crossProduct = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
