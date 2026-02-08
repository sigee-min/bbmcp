import type { Limits, TextureStat, TextureUsage } from '../model';
import type { UvPolicyConfig } from '../uv/policy';

export type ValidationMessages = {
  noBones: string;
  orphanCube: (cubeName: string, boneName: string) => string;
  duplicateBone: (name: string) => string;
  duplicateCube: (name: string) => string;
  duplicateMesh: (name: string) => string;
  cubeContainment: (inner: string, outer: string) => string;
  maxCubesExceeded: (count: number, max: number) => string;
  animationTooLong: (name: string, maxSeconds: number) => string;
  meshVertexInvalid: (meshName: string, vertexId: string) => string;
  meshVertexDuplicate: (meshName: string, vertexId: string) => string;
  meshFaceVerticesInvalid: (meshName: string, faceId: string) => string;
  meshFaceVertexUnknown: (meshName: string, faceId: string, vertexId: string) => string;
  meshFaceDegenerate: (meshName: string, faceId: string) => string;
  meshFaceUvVertexUnknown: (meshName: string, faceId: string, vertexId: string) => string;
  meshFaceUvInvalid: (meshName: string, faceId: string, vertexId: string) => string;
  textureTooLarge: (name: string, max: number) => string;
  textureSizeMismatch: (name: string, actualW: number, actualH: number, expectedW: number, expectedH: number) => string;
  uvOutOfBounds: (cubeName: string, u: number, v: number, width: number, height: number) => string;
  textureUnresolvedRefs: (count: number) => string;
  textureUnassigned: (name: string) => string;
  faceUvOutOfBounds: (
    cubeName: string,
    face: string,
    width: number,
    height: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => string;
  uvOverlap: (name: string, count: number, example: string) => string;
  uvScaleMismatch: (name: string, count: number, example: string) => string;
  uvScaleMismatchSummary: (mismatched: number, total: number) => string;
};

export interface ValidationContext {
  limits: Limits;
  textures?: TextureStat[];
  textureResolution?: { width: number; height: number };
  textureUsage?: TextureUsage;
  uvPolicy?: UvPolicyConfig;
}
