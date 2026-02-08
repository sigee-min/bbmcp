import type { Cube, CubeFaceDirection, TextureUsage } from '../model';
import type { UvPolicyConfig } from './policy';
import type { UvOverlapExample } from './overlap';
import { findUvOverlapIssues, formatUvFaceRect } from './overlap';
import { findUvScaleIssues } from './scale';

export const computeUvOverlapIssues = (usage: TextureUsage) => findUvOverlapIssues(usage);

export const computeUvScaleIssues = (
  usage: TextureUsage,
  cubes: Cube[],
  resolution: { width: number; height: number },
  policy: UvPolicyConfig
) => findUvScaleIssues(usage, cubes, resolution, policy);

export const formatOverlapExample = (example?: UvOverlapExample): string =>
  example ? ` Example: ${formatUvFaceRect(example.a)} overlaps ${formatUvFaceRect(example.b)}.` : '';

export const formatScaleExample = (example?: {
  cubeName: string;
  face: string;
  actual: { width: number; height: number };
  expected: { width: number; height: number };
  ratio?: { width: number; height: number };
  reason?: 'tiny' | 'ratio' | 'exceeds';
}): string => {
  if (!example) return '';
  const ratio = example.ratio ? ` (scale ${formatRatio(example.ratio)})` : '';
  const reason =
    example.reason === 'tiny'
      ? ' (tiny face)'
      : example.reason === 'exceeds'
        ? ' (expected exceeds texture)'
        : '';
  return `${example.cubeName} (${example.face}) actual ${example.actual.width}x${example.actual.height} vs expected ${example.expected.width}x${example.expected.height}${ratio}${reason}`;
};

const formatRatio = (ratio: { width: number; height: number }) => {
  const width = Number.isFinite(ratio.width) ? ratio.width.toFixed(2) : '?';
  const height = Number.isFinite(ratio.height) ? ratio.height.toFixed(2) : '?';
  return `${width}x${height}`;
};

export type UvRectIssueExample = {
  cubeName: string;
  face: CubeFaceDirection;
  width: number;
  height: number;
  area: number;
  aspectRatio: number;
};

export type UvRectIssue = {
  textureName: string;
  count: number;
  example: UvRectIssueExample;
};

export type UvRectIssueConfig = {
  minArea: number;
  maxAspect: number;
};

export const computeUvRectIssues = (
  usage: TextureUsage,
  config: UvRectIssueConfig
): { small: UvRectIssue[]; skewed: UvRectIssue[] } => {
  const smallByTexture = new Map<string, { count: number; example: UvRectIssueExample }>();
  const skewedByTexture = new Map<string, { count: number; example: UvRectIssueExample }>();
  const minArea = Number.isFinite(config.minArea) ? Math.max(0, config.minArea) : 0;
  const maxAspect = Number.isFinite(config.maxAspect) ? Math.max(1, config.maxAspect) : 1;

  usage.textures.forEach((texture) => {
    texture.cubes.forEach((cube) => {
      cube.faces.forEach((face) => {
        if (!face.uv) return;
        const [x1, y1, x2, y2] = face.uv;
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        const area = width * height;
        const aspectRatio = width >= height ? width / height : height / width;
        const example: UvRectIssueExample = {
          cubeName: cube.name,
          face: face.face,
          width,
          height,
          area,
          aspectRatio
        };
        if (area <= minArea) {
          recordRectIssue(smallByTexture, texture.name, example);
        }
        if (aspectRatio >= maxAspect) {
          recordRectIssue(skewedByTexture, texture.name, example);
        }
      });
    });
  });

  return {
    small: toRectIssues(smallByTexture),
    skewed: toRectIssues(skewedByTexture)
  };
};

export const formatRectExample = (example?: UvRectIssueExample): string => {
  if (!example) return '';
  const ratio = Number.isFinite(example.aspectRatio) ? ` ratio ${example.aspectRatio.toFixed(2)}:1` : '';
  return ` Example: ${example.cubeName} (${example.face}) ${example.width}x${example.height}${ratio}.`;
};

const recordRectIssue = (
  store: Map<string, { count: number; example: UvRectIssueExample }>,
  textureName: string,
  example: UvRectIssueExample
) => {
  const existing = store.get(textureName);
  if (existing) {
    existing.count += 1;
  } else {
    store.set(textureName, { count: 1, example });
  }
};

const toRectIssues = (store: Map<string, { count: number; example: UvRectIssueExample }>): UvRectIssue[] =>
  Array.from(store.entries()).map(([textureName, entry]) => ({
    textureName,
    count: entry.count,
    example: entry.example
  }));
