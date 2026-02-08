import type { Cube, CubeFaceDirection, TextureUsage } from '../model';
import { UvPolicyConfig, computeExpectedUvSizeWithOverflow, getFaceDimensions } from './policy';

export type UvScaleIssue = {
  textureId?: string;
  textureName: string;
  mismatchCount: number;
  scale?: { width: number; height: number };
  example?: {
    cubeName: string;
    face: CubeFaceDirection;
    actual: { width: number; height: number };
    expected: { width: number; height: number };
    ratio?: { width: number; height: number };
    reason?: 'tiny' | 'ratio' | 'exceeds';
    uv: [number, number, number, number];
  };
};

export type UvScaleResult = {
  issues: UvScaleIssue[];
  totalFaces: number;
  mismatchedFaces: number;
};

export const findUvScaleIssues = (
  usage: TextureUsage,
  cubes: Cube[],
  resolution: { width: number; height: number } | undefined,
  policy: UvPolicyConfig
): UvScaleResult => {
  const cubeById = new Map<string, Cube>();
  const cubeByName = new Map<string, Cube>();
  cubes.forEach((cube) => {
    if (cube.id) cubeById.set(cube.id, cube);
    cubeByName.set(cube.name, cube);
  });
  const issues: UvScaleIssue[] = [];
  let totalFaces = 0;
  let mismatchedFaces = 0;
  usage.textures.forEach((entry) => {
    const entryResolution = resolveEntryResolution(entry, resolution);
    if (!entryResolution) return;
    const scaleTarget = resolveScaleTarget(entry, cubeById, cubeByName, entryResolution, policy);
    let mismatchCount = 0;
    let example: UvScaleIssue['example'] | undefined;
    entry.cubes.forEach((cube) => {
      const resolved = cube.id ? cubeById.get(cube.id) : undefined;
      const target = resolved ?? cubeByName.get(cube.name);
      if (!target) return;
      cube.faces.forEach((face) => {
        const uv = face.uv;
        if (!uv) return;
        totalFaces += 1;
        const expectedRes = computeExpectedUvSizeWithOverflow(
          getFaceDimensions(target, face.face),
          entryResolution,
          policy
        );
        if (!expectedRes) return;
        const expected = { width: expectedRes.width, height: expectedRes.height };
        const actualWidth = Math.abs(uv[2] - uv[0]);
        const actualHeight = Math.abs(uv[3] - uv[1]);
        const mismatch = expectedRes.exceedsTexture
          ? 'exceeds'
          : getScaleMismatchReason(actualWidth, actualHeight, expected, policy, scaleTarget);
        if (!mismatch) return;
        mismatchCount += 1;
        mismatchedFaces += 1;
        if (!example) {
          example = {
            cubeName: cube.name,
            face: face.face,
            actual: { width: actualWidth, height: actualHeight },
            expected,
            ratio: buildRatio(actualWidth, actualHeight, expected),
            reason: mismatch,
            uv
          };
        }
      });
    });
    if (mismatchCount > 0) {
      issues.push({
        textureId: entry.id ?? undefined,
        textureName: entry.name,
        mismatchCount,
        scale: scaleTarget,
        ...(example ? { example } : {})
      });
    }
  });
  return { issues, totalFaces, mismatchedFaces };
};

const getScaleMismatchReason = (
  actualWidth: number,
  actualHeight: number,
  expected: { width: number; height: number },
  policy: UvPolicyConfig,
  scaleTarget: { width: number; height: number }
): 'tiny' | 'ratio' | null => {
  const scaledExpectedWidth = Number.isFinite(scaleTarget.width) && scaleTarget.width > 0
    ? expected.width * scaleTarget.width
    : expected.width;
  const scaledExpectedHeight = Number.isFinite(scaleTarget.height) && scaleTarget.height > 0
    ? expected.height * scaleTarget.height
    : expected.height;
  const isTinyActual = actualWidth <= policy.tinyThreshold || actualHeight <= policy.tinyThreshold;
  const isTinyExpected = scaledExpectedWidth <= policy.tinyThreshold || scaledExpectedHeight <= policy.tinyThreshold;
  if (isTinyActual || isTinyExpected) {
    return isTinyActual && isTinyExpected ? null : 'tiny';
  }
  if (expected.width <= 0 || expected.height <= 0) return null;
  const widthRatio = actualWidth / expected.width;
  const heightRatio = actualHeight / expected.height;
  const widthMismatch = Math.abs(scaleTarget.width - widthRatio) > policy.scaleTolerance;
  const heightMismatch = Math.abs(scaleTarget.height - heightRatio) > policy.scaleTolerance;
  return widthMismatch || heightMismatch ? 'ratio' : null;
};

const resolveScaleTarget = (
  entry: TextureUsage['textures'][number],
  cubeById: Map<string, Cube>,
  cubeByName: Map<string, Cube>,
  resolution: { width: number; height: number },
  policy: UvPolicyConfig
): { width: number; height: number } => {
  const widthRatios: number[] = [];
  const heightRatios: number[] = [];
  entry.cubes.forEach((cube) => {
    const resolved = cube.id ? cubeById.get(cube.id) : undefined;
    const target = resolved ?? cubeByName.get(cube.name);
    if (!target) return;
    cube.faces.forEach((face) => {
      const uv = face.uv;
      if (!uv) return;
      const expectedRes = computeExpectedUvSizeWithOverflow(getFaceDimensions(target, face.face), resolution, policy);
      if (!expectedRes || expectedRes.exceedsTexture) return;
      const expected = { width: expectedRes.width, height: expectedRes.height };
      const actualWidth = Math.abs(uv[2] - uv[0]);
      const actualHeight = Math.abs(uv[3] - uv[1]);
      if (actualWidth <= policy.tinyThreshold || actualHeight <= policy.tinyThreshold) return;
      if (expected.width <= policy.tinyThreshold || expected.height <= policy.tinyThreshold) return;
      const widthRatio = actualWidth / expected.width;
      const heightRatio = actualHeight / expected.height;
      if (Number.isFinite(widthRatio) && widthRatio > 0) widthRatios.push(widthRatio);
      if (Number.isFinite(heightRatio) && heightRatio > 0) heightRatios.push(heightRatio);
    });
  });
  return {
    width: median(widthRatios) ?? 1,
    height: median(heightRatios) ?? 1
  };
};

const resolveEntryResolution = (
  entry: TextureUsage['textures'][number],
  fallback: { width: number; height: number } | undefined
): { width: number; height: number } | null => {
  const width = normalizeResolution(entry.width);
  const height = normalizeResolution(entry.height);
  if (width && height) return { width, height };
  if (fallback && Number.isFinite(fallback.width) && Number.isFinite(fallback.height)) {
    return { width: fallback.width, height: fallback.height };
  }
  return null;
};

const normalizeResolution = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
};

const buildRatio = (
  actualWidth: number,
  actualHeight: number,
  expected: { width: number; height: number }
): { width: number; height: number } | undefined => {
  if (expected.width <= 0 || expected.height <= 0) return undefined;
  const widthRatio = actualWidth / expected.width;
  const heightRatio = actualHeight / expected.height;
  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio)) return undefined;
  return { width: widthRatio, height: heightRatio };
};

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};




