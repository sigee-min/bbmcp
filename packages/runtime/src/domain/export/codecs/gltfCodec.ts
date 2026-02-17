import type { CanonicalExportModel, CodecEncodeResult, ExportCodecStrategy } from './types';
import { buildAnimations } from './gltf/animation';
import { ByteWriter, encodeDataUri, packFloat32, packUint16 } from './gltf/buffer';
import type { GltfAccessor, GltfBufferView, GltfDocument, GltfMaterial, GltfNode } from './gltf/document';
import { buildGeometryStreams } from './gltf/geometry';
import type { Mat4, Vec3, Vec4 } from './gltf/primitives';
import { mat4FromTrs, mat4Invert, mat4Multiply, quatFromEulerDegXYZ, sanitizeNumber, vec3Sub } from './gltf/primitives';

export class GltfCodec implements ExportCodecStrategy {
  readonly format = 'gltf' as const;

  encode(model: CanonicalExportModel): CodecEncodeResult {
    const warnings = new Set<string>();

    const bonesIn = model.bones ?? [];
    const bones: CanonicalExportModel['bones'] = bonesIn.length === 0
      ? [{ name: 'root', pivot: [0, 0, 0], cubes: [] }]
      : bonesIn;

    const boneIndexByName = new Map<string, number>();
    bones.forEach((bone, idx) => {
      boneIndexByName.set(bone.name, idx);
    });

    const parentIndex: number[] = bones.map((bone) => {
      if (!bone.parent) return -1;
      const parentIdx = boneIndexByName.get(bone.parent);
      return parentIdx === undefined ? -1 : parentIdx;
    });

    const firstRootIdx = parentIndex.findIndex((idx) => idx === -1);
    const rootBoneIndex = boneIndexByName.get('root') ?? (firstRootIdx >= 0 ? firstRootIdx : 0);

    const boneLocalTranslation = (idx: number): Vec3 => {
      const b = bones[idx]!;
      const pivot = b.pivot as Vec3;
      const pIdx = parentIndex[idx] ?? -1;
      if (pIdx < 0) return [sanitizeNumber(pivot[0]), sanitizeNumber(pivot[1]), sanitizeNumber(pivot[2])];
      const parentPivot = (bones[pIdx]!.pivot ?? [0, 0, 0]) as Vec3;
      return vec3Sub(pivot, parentPivot);
    };

    const boneBaseRotationQuat = (idx: number): Vec4 => {
      const b = bones[idx]!;
      const rot = (b.rotation ?? [0, 0, 0]) as Vec3;
      return quatFromEulerDegXYZ(rot);
    };

    const boneBaseScale = (idx: number): Vec3 => {
      const b = bones[idx]!;
      return (b.scale ?? [1, 1, 1]) as Vec3;
    };

    const childrenByIndex: number[][] = bones.map(() => []);
    bones.forEach((bone, idx) => {
      const p = bone.parent ? boneIndexByName.get(bone.parent) : undefined;
      if (p === undefined) return;
      childrenByIndex[p]!.push(idx);
    });

    const nodes: GltfNode[] = bones.map((bone, idx) => ({
      name: bone.name,
      translation: boneLocalTranslation(idx),
      rotation: boneBaseRotationQuat(idx),
      scale: boneBaseScale(idx),
      children: childrenByIndex[idx]!
    }));

    const meshNodeIndex = bones.length;
    nodes.push({
      name: model.name,
      mesh: 0,
      skin: 0
    });

    const rootNodes: number[] = [];
    bones.forEach((_, idx) => {
      if (parentIndex[idx] === -1) rootNodes.push(idx);
    });
    if (rootNodes.length === 0) rootNodes.push(0);
    rootNodes.push(meshNodeIndex);

    const skeletonIndex =
      boneIndexByName.get('root') ??
      rootNodes.find((idx) => idx !== meshNodeIndex) ??
      0;

    const geometry = buildGeometryStreams({
      model,
      boneIndexByName,
      rootBoneIndex,
      warnings
    });

    const vertexCount = Math.floor(geometry.positions.length / 3);

    const { animations, samplersByAnimation } = buildAnimations({
      model,
      rootBoneIndex,
      boneIndexByName,
      boneLocalTranslation,
      boneBaseRotationQuat,
      boneBaseScale,
      warnings
    });

    // IBM buffer section.
    const localMatrices: Mat4[] = bones.map((_, idx) => {
      const t = boneLocalTranslation(idx);
      const r = boneBaseRotationQuat(idx);
      const s = boneBaseScale(idx);
      return mat4FromTrs(t, r, s);
    });

    const globalMatrices: Array<Mat4 | null> = bones.map(() => null);
    const visiting = new Set<number>();
    const computeGlobal = (idx: number): Mat4 => {
      const cached = globalMatrices[idx];
      if (cached) return cached;
      if (visiting.has(idx)) return localMatrices[idx]!;
      visiting.add(idx);
      const p = parentIndex[idx] ?? -1;
      const local = localMatrices[idx]!;
      const global = p < 0 ? local : mat4Multiply(computeGlobal(p), local);
      visiting.delete(idx);
      globalMatrices[idx] = global;
      return global;
    };

    const inverseBindMatrices: number[] = [];
    for (let i = 0; i < bones.length; i += 1) {
      const global = computeGlobal(i);
      const inv = mat4Invert(global);
      inverseBindMatrices.push(...inv);
    }

    // Pack buffer.
    const bufferViews: GltfBufferView[] = [];
    const accessors: GltfAccessor[] = [];
    const writer = new ByteWriter();

    const pushSection = (data: Uint8Array): { offset: number; length: number } => {
      writer.align4();
      const offset = writer.length;
      writer.append(data);
      return { offset, length: data.length };
    };

    const ibmSec = pushSection(packFloat32(inverseBindMatrices));
    const posSec = pushSection(packFloat32(geometry.positions));
    const nrmSec = pushSection(packFloat32(geometry.normals));
    const uvSec = pushSection(packFloat32(geometry.texcoords));
    const jntSec = pushSection(packUint16(geometry.joints));
    const wgtSec = pushSection(packFloat32(geometry.weights));

    const baseBufferViews = [ibmSec, posSec, nrmSec, uvSec, jntSec, wgtSec];
    baseBufferViews.forEach((sec) => {
      bufferViews.push({ buffer: 0, byteOffset: sec.offset, byteLength: sec.length });
    });

    accessors.push({
      bufferView: 0,
      componentType: 5126,
      count: bones.length,
      type: 'MAT4'
    });
    accessors.push({
      bufferView: 1,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    });
    accessors.push({
      bufferView: 2,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC3'
    });
    accessors.push({
      bufferView: 3,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC2'
    });
    accessors.push({
      bufferView: 4,
      componentType: 5123,
      count: vertexCount,
      type: 'VEC4'
    });
    accessors.push({
      bufferView: 5,
      componentType: 5126,
      count: vertexCount,
      type: 'VEC4'
    });

    // Animation data packing.
    let nextAccessorIndex = 6;
    let nextBufferViewIndex = 6;
    animations.forEach((anim, animIdx) => {
      const built = samplersByAnimation[animIdx] ?? [];
      built.forEach((sampler, samplerIdx) => {
        const inputSec = pushSection(packFloat32(sampler.inputTimes));
        bufferViews.push({ buffer: 0, byteOffset: inputSec.offset, byteLength: inputSec.length });
        const inputAccessor = nextAccessorIndex++;
        accessors.push({
          bufferView: nextBufferViewIndex++,
          componentType: 5126,
          count: sampler.inputTimes.length,
          type: 'SCALAR'
        });

        const outputSec = pushSection(packFloat32(sampler.outputValues));
        bufferViews.push({ buffer: 0, byteOffset: outputSec.offset, byteLength: outputSec.length });
        const outputAccessor = nextAccessorIndex++;
        accessors.push({
          bufferView: nextBufferViewIndex++,
          componentType: 5126,
          count: sampler.outputType === 'VEC4' ? sampler.outputValues.length / 4 : sampler.outputValues.length / 3,
          type: sampler.outputType
        });

        anim.samplers[samplerIdx] = {
          input: inputAccessor,
          output: outputAccessor,
          interpolation: sampler.interpolation
        };
      });
    });

    const bufferBytes = writer.toUint8Array();
    const bufferDataUri = encodeDataUri('application/octet-stream', bufferBytes);

    const primaryTexture = model.textures[0];
    const textureDataUri = primaryTexture?.dataUri;
    const hasTexture = typeof textureDataUri === 'string' && textureDataUri.length > 0;
    if (!hasTexture) warnings.add('GLT-WARN-TEXTURE_DATA_MISSING');

    const material: GltfMaterial = hasTexture
      ? {
          pbrMetallicRoughness: {
            baseColorTexture: { index: 0 },
            metallicFactor: 0.0,
            roughnessFactor: 1.0
          },
          doubleSided: true
        }
      : {
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0.0,
            roughnessFactor: 1.0
          },
          doubleSided: true
        };

    const gltf: GltfDocument = {
      asset: { version: '2.0', generator: 'ashfox gltf_codec v1' },
      scene: 0,
      scenes: [{ nodes: rootNodes }],
      nodes,
      meshes: [
        {
          primitives: [
            {
              attributes: {
                POSITION: 1,
                NORMAL: 2,
                TEXCOORD_0: 3,
                JOINTS_0: 4,
                WEIGHTS_0: 5
              },
              mode: 4,
              material: 0
            }
          ]
        }
      ],
      skins: [
        {
          joints: bones.map((_, idx) => idx),
          skeleton: skeletonIndex,
          inverseBindMatrices: 0
        }
      ],
      buffers: [{ byteLength: bufferBytes.length, uri: bufferDataUri }],
      bufferViews,
      accessors,
      materials: [material],
      animations
    };

    if (hasTexture) {
      gltf.samplers = [
        { magFilter: 9729, minFilter: 9729, wrapS: 10497, wrapT: 10497 }
      ];
      gltf.images = [{ uri: textureDataUri }];
      gltf.textures = [{ sampler: 0, source: 0 }];
    }

    return {
      artifacts: [
        {
          id: 'gltf',
          data: gltf,
          path: { mode: 'base_suffix', suffix: '.gltf' },
          primary: true
        }
      ],
      warnings: [...warnings].sort(),
      lossy: warnings.size > 0
    };
  }
}
