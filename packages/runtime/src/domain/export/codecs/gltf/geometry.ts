import type { CanonicalExportModel } from '../types';
import type { Vec2, Vec3, Vec4 } from './primitives';
import {
  isZeroVec3,
  quatFromEulerDegXYZ,
  rotateVec3ByQuat,
  sanitizeNumber,
  vec3Add,
  vec3Cross,
  vec3Length,
  vec3Normalize,
  vec3Sub
} from './primitives';

export type GeometryStreams = {
  positions: number[];
  normals: number[];
  texcoords: number[];
  joints: number[];
  weights: number[];
};

export const buildGeometryStreams = (params: {
  model: CanonicalExportModel;
  boneIndexByName: Map<string, number>;
  rootBoneIndex: number;
  warnings: Set<string>;
}): GeometryStreams => {
  const { model, boneIndexByName, rootBoneIndex, warnings } = params;

  // Geometry streams (non-indexed triangle list).
  const positions: number[] = [];
  const normals: number[] = [];
  const texcoords: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];

  const tw = sanitizeNumber(model.texture.width) || 1;
  const th = sanitizeNumber(model.texture.height) || 1;

  const pushVertex = (pos: Vec3, normal: Vec3, uv: Vec2, jointIndex: number): void => {
    positions.push(sanitizeNumber(pos[0]), sanitizeNumber(pos[1]), sanitizeNumber(pos[2]));
    normals.push(sanitizeNumber(normal[0]), sanitizeNumber(normal[1]), sanitizeNumber(normal[2]));
    texcoords.push(sanitizeNumber(uv[0]), sanitizeNumber(uv[1]));
    joints.push(jointIndex, 0, 0, 0);
    weights.push(1, 0, 0, 0);
  };

  const pushTriangle = (
    verts: [Vec3, Vec3, Vec3],
    normal: Vec3,
    uvs: [Vec2, Vec2, Vec2],
    jointIndex: number
  ): void => {
    pushVertex(verts[0], normal, uvs[0], jointIndex);
    pushVertex(verts[1], normal, uvs[1], jointIndex);
    pushVertex(verts[2], normal, uvs[2], jointIndex);
  };

  const appendCube = (cube: CanonicalExportModel['cubes'][number]) => {
    const boneIdx = boneIndexByName.get(cube.bone);
    const jointIndex = boneIdx === undefined ? rootBoneIndex : boneIdx;
    if (boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

    let x0 = sanitizeNumber(cube.from[0]);
    let y0 = sanitizeNumber(cube.from[1]);
    let z0 = sanitizeNumber(cube.from[2]);
    let x1 = sanitizeNumber(cube.to[0]);
    let y1 = sanitizeNumber(cube.to[1]);
    let z1 = sanitizeNumber(cube.to[2]);

    const inflate = cube.inflate !== undefined ? sanitizeNumber(cube.inflate) : 0;
    if (inflate !== 0) {
      x0 -= inflate;
      y0 -= inflate;
      z0 -= inflate;
      x1 += inflate;
      y1 += inflate;
      z1 += inflate;
    }

    const sx = sanitizeNumber(x1 - x0);
    const sy = sanitizeNumber(y1 - y0);
    const sz = sanitizeNumber(z1 - z0);

    const uvBase = (cube.uvOffset ?? cube.uv ?? [0, 0]) as Vec2;
    const uvProvided = cube.uvOffset !== undefined || cube.uv !== undefined;
    if (!uvProvided) warnings.add('GLT-WARN-CUBE_UV_MISSING');
    const u = sanitizeNumber(uvBase[0]);
    const v = sanitizeNumber(uvBase[1]);

    const u0 = u;
    const u1 = u0 + sz;
    const u2 = u1 + sx;
    const u3 = u2 + sz;
    // const u4 = u3 + sx; // unused in v1 mapping
    const v0 = v;
    const v1 = v0 + sz;
    // const v2 = v1 + sy; // unused in v1 mapping

    const rects = {
      up: { u0: u1, v0, w: sx, h: sz },
      down: { u0: u2, v0, w: sx, h: sz },
      west: { u0: u0, v0: v1, w: sz, h: sy },
      north: { u0: u1, v0: v1, w: sx, h: sy },
      east: { u0: u2, v0: v1, w: sz, h: sy },
      south: { u0: u3, v0: v1, w: sx, h: sy }
    } as const;

    const mirror = cube.mirror === true;
    const rectUv = (r: { u0: number; v0: number; w: number; h: number }) => {
      let uMin = r.u0 / tw;
      let uMax = (r.u0 + r.w) / tw;
      const vMin = r.v0 / th;
      const vMax = (r.v0 + r.h) / th;
      if (mirror) {
        const tmp = uMin;
        uMin = uMax;
        uMax = tmp;
      }
      return { uMin, uMax, vMin, vMax };
    };

    const hasRotation = cube.rotation !== undefined && !isZeroVec3(cube.rotation as Vec3);
    const qRot = hasRotation ? quatFromEulerDegXYZ(cube.rotation as Vec3) : ([0, 0, 0, 1] as Vec4);
    const pivot: Vec3 = hasRotation
      ? (cube.origin
          ? (cube.origin as Vec3)
          : ([sanitizeNumber((x0 + x1) / 2), sanitizeNumber((y0 + y1) / 2), sanitizeNumber((z0 + z1) / 2)] as Vec3))
      : ([0, 0, 0] as Vec3);
    if (hasRotation && !cube.origin) warnings.add('GLT-WARN-CUBE_PIVOT_DEFAULTED');

    const rotatePos = (p: Vec3): Vec3 => {
      if (!hasRotation) return p;
      const relative = vec3Sub(p, pivot);
      const rotated = rotateVec3ByQuat(qRot, relative);
      return vec3Add(pivot, rotated);
    };
    const rotateNormal = (n: Vec3): Vec3 => (hasRotation ? vec3Normalize(rotateVec3ByQuat(qRot, n)) : n);

    const faces = [
      {
        id: 'north',
        normal: rotateNormal([0, 0, -1]),
        verts: [
          rotatePos([x0, y0, z0]),
          rotatePos([x0, y1, z0]),
          rotatePos([x1, y1, z0]),
          rotatePos([x1, y0, z0])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.north),
        map: 'north'
      },
      {
        id: 'south',
        normal: rotateNormal([0, 0, 1]),
        verts: [
          rotatePos([x1, y0, z1]),
          rotatePos([x1, y1, z1]),
          rotatePos([x0, y1, z1]),
          rotatePos([x0, y0, z1])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.south),
        map: 'south'
      },
      {
        id: 'east',
        normal: rotateNormal([1, 0, 0]),
        verts: [
          rotatePos([x1, y0, z0]),
          rotatePos([x1, y1, z0]),
          rotatePos([x1, y1, z1]),
          rotatePos([x1, y0, z1])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.east),
        map: 'east'
      },
      {
        id: 'west',
        normal: rotateNormal([-1, 0, 0]),
        verts: [
          rotatePos([x0, y0, z1]),
          rotatePos([x0, y1, z1]),
          rotatePos([x0, y1, z0]),
          rotatePos([x0, y0, z0])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.west),
        map: 'west'
      },
      {
        id: 'up',
        normal: rotateNormal([0, 1, 0]),
        verts: [
          rotatePos([x0, y1, z0]),
          rotatePos([x0, y1, z1]),
          rotatePos([x1, y1, z1]),
          rotatePos([x1, y1, z0])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.up),
        map: 'up'
      },
      {
        id: 'down',
        normal: rotateNormal([0, -1, 0]),
        verts: [
          rotatePos([x0, y0, z1]),
          rotatePos([x0, y0, z0]),
          rotatePos([x1, y0, z0]),
          rotatePos([x1, y0, z1])
        ] as [Vec3, Vec3, Vec3, Vec3],
        uv: rectUv(rects.down),
        map: 'down'
      }
    ] as const;

    for (const face of faces) {
      const { uMin, uMax, vMin, vMax } = face.uv;
      const v0uv: Vec2 = (() => {
        if (face.map === 'up' || face.map === 'down') return [uMin, vMin];
        if (face.map === 'north' || face.map === 'south') return [uMin, vMax];
        return [uMax, vMax];
      })();
      const v1uv: Vec2 = (() => {
        if (face.map === 'up' || face.map === 'down') return [uMin, vMax];
        if (face.map === 'north' || face.map === 'south') return [uMin, vMin];
        return [uMax, vMin];
      })();
      const v2uv: Vec2 = (() => {
        if (face.map === 'up' || face.map === 'down') return [uMax, vMax];
        if (face.map === 'north' || face.map === 'south') return [uMax, vMin];
        return [uMin, vMin];
      })();
      const v3uv: Vec2 = (() => {
        if (face.map === 'up' || face.map === 'down') return [uMax, vMin];
        if (face.map === 'north' || face.map === 'south') return [uMax, vMax];
        return [uMin, vMax];
      })();

      const v0 = face.verts[0];
      const v1 = face.verts[1];
      const v2 = face.verts[2];
      const v3 = face.verts[3];
      const normal = face.normal;

      // (0,1,2), (0,2,3)
      pushTriangle([v0, v1, v2], normal, [v0uv, v1uv, v2uv], jointIndex);
      pushTriangle([v0, v2, v3], normal, [v0uv, v2uv, v3uv], jointIndex);
    }
  };

  const appendMesh = (mesh: CanonicalExportModel['meshes'][number]) => {
    const hasBoneRef = Boolean(mesh.bone);
    const boneIdx = mesh.bone ? boneIndexByName.get(mesh.bone) : undefined;
    const jointIndex = hasBoneRef ? (boneIdx === undefined ? rootBoneIndex : boneIdx) : rootBoneIndex;
    if (hasBoneRef && boneIdx === undefined) warnings.add('GLT-WARN-ORPHAN_GEOMETRY');

    const vertices = new Map<string, Vec3>();
    mesh.vertices.forEach((v) => vertices.set(v.id, v.pos as Vec3));

    const hasRotation = mesh.rotation !== undefined && !isZeroVec3(mesh.rotation as Vec3);
    const qRot = hasRotation ? quatFromEulerDegXYZ(mesh.rotation as Vec3) : ([0, 0, 0, 1] as Vec4);
    const pivot = (mesh.origin ?? [0, 0, 0]) as Vec3;
    if (hasRotation && !mesh.origin) warnings.add('GLT-WARN-MESH_PIVOT_MISSING');

    const rotatePos = (p: Vec3): Vec3 => {
      if (!hasRotation || !mesh.origin) return p;
      const relative = vec3Sub(p, pivot);
      const rotated = rotateVec3ByQuat(qRot, relative);
      return vec3Add(pivot, rotated);
    };

    mesh.faces.forEach((face) => {
      if (face.vertices.length < 3) return;
      const uvMap = new Map<string, Vec2>();
      (face.uv ?? []).forEach((entry) => uvMap.set(entry.vertexId, entry.uv as Vec2));

      const ids = face.vertices;
      const v0Id = ids[0]!;
      for (let i = 1; i < ids.length - 1; i += 1) {
        const v1Id = ids[i]!;
        const v2Id = ids[i + 1]!;

        const p0 = rotatePos((vertices.get(v0Id) ?? [0, 0, 0]) as Vec3);
        const p1 = rotatePos((vertices.get(v1Id) ?? [0, 0, 0]) as Vec3);
        const p2 = rotatePos((vertices.get(v2Id) ?? [0, 0, 0]) as Vec3);

        const edge1 = vec3Sub(p1, p0);
        const edge2 = vec3Sub(p2, p0);
        let normal = vec3Normalize(vec3Cross(edge1, edge2));
        if (vec3Length(vec3Cross(edge1, edge2)) === 0) {
          warnings.add('GLT-WARN-DEGENERATE_TRIANGLE');
          normal = [0, 0, 1];
        }

        const uvFor = (id: string): Vec2 => {
          const uvPx = uvMap.get(id);
          if (!uvPx) {
            warnings.add('GLT-WARN-MESH_UV_MISSING');
            return [0, 0];
          }
          return [sanitizeNumber(uvPx[0] / tw), sanitizeNumber(uvPx[1] / th)];
        };

        pushTriangle([p0, p1, p2], normal, [uvFor(v0Id), uvFor(v1Id), uvFor(v2Id)], jointIndex);
      }
    });
  };

  model.cubes.forEach(appendCube);
  model.meshes.forEach(appendMesh);

  return {
    positions,
    normals,
    texcoords,
    joints,
    weights
  };
};
