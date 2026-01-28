import type { Cube, TextureUsage } from '../domain/model';
import { computeTextureUsageId } from '../domain/textureUsage';
import type { UvPolicyConfig } from '../domain/uvPolicy';
import type { ToolResponse } from '../types';
import type { ToolService } from '../usecases/ToolService';
import { toDomainCube, toDomainTextureUsage } from '../usecases/domainMappers';
import type { MetaOptions } from './meta';
import { loadProjectState } from './projectState';
import { isUsecaseError, usecaseError } from './guardHelpers';

export type UvProjectContext = {
  cubes: Cube[];
  resolution?: { width: number; height: number };
  policy: UvPolicyConfig;
};

export type UvContext = {
  usage: TextureUsage;
  cubes: Cube[];
  resolution?: { width: number; height: number };
  policy: UvPolicyConfig;
};

export type UvContextCache = {
  project?: ToolResponse<UvProjectContext>;
  usage?: { usage: TextureUsage; uvUsageId: string };
};

type UvContextOptions = {
  cache?: UvContextCache;
  expectedUvUsageId?: string;
};

const loadUvProjectContext = (
  service: ToolService,
  meta: MetaOptions,
  cache?: UvContextCache
): ToolResponse<UvProjectContext> => {
  if (cache?.project) return cache.project;
  const projectRes = loadProjectState(service, meta, 'full', { includeUsage: false });
  if (!projectRes.ok) {
    if (cache) cache.project = projectRes;
    return projectRes;
  }
  const project = projectRes.data;
  const result: ToolResponse<UvProjectContext> = {
    ok: true,
    data: {
      cubes: (project.cubes ?? []).map((cube) => toDomainCube(cube)),
      resolution: project.textureResolution,
      policy: service.getUvPolicy()
    }
  };
  if (cache) cache.project = result;
  return result;
};

const loadUvUsage = (
  service: ToolService,
  meta: MetaOptions,
  usageOverride: TextureUsage | undefined,
  cache?: UvContextCache,
  expectedUvUsageId?: string
): ToolResponse<TextureUsage> => {
  if (usageOverride) {
    const usageId = computeTextureUsageId(usageOverride);
    if (cache) cache.usage = { usage: usageOverride, uvUsageId: usageId };
    return { ok: true, data: usageOverride };
  }
  const cached = cache?.usage;
  if (cached && (!expectedUvUsageId || cached.uvUsageId === expectedUvUsageId)) {
    return { ok: true, data: cached.usage };
  }
  const usageRes = service.getTextureUsage({});
  if (isUsecaseError(usageRes)) return usecaseError(usageRes, meta, service);
  const usage = toDomainTextureUsage(usageRes.value);
  const uvUsageId = computeTextureUsageId(usage);
  if (cache) cache.usage = { usage, uvUsageId };
  return { ok: true, data: usage };
};

export const cacheUvUsage = (
  cache: UvContextCache | undefined,
  usage: TextureUsage,
  uvUsageId: string
): void => {
  if (!cache) return;
  cache.usage = { usage, uvUsageId };
};

export const loadUvContext = (
  service: ToolService,
  meta: MetaOptions,
  usageOverride?: TextureUsage,
  options: UvContextOptions = {}
): ToolResponse<UvContext> => {
  const projectRes = loadUvProjectContext(service, meta, options.cache);
  if (!projectRes.ok) return projectRes;
  const usageRes = loadUvUsage(service, meta, usageOverride, options.cache, options.expectedUvUsageId);
  if (!usageRes.ok) return usageRes;
  return {
    ok: true,
    data: {
      usage: usageRes.data,
      cubes: projectRes.data.cubes,
      resolution: projectRes.data.resolution,
      policy: projectRes.data.policy
    }
  };
};
