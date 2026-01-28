import type { BlockPipelineResult } from '../types';
import { BlockPipelineMode, BlockPipelineOnConflict, BlockPipelineTextures, BlockVariant } from '../types/blockPipeline';
import { buildBlockPipeline, BlockPipelineSpec, BlockResource } from '../services/blockPipeline';
import type { ResourceStore } from '../ports/resources';
import { ok, fail, UsecaseResult } from './result';
import { ensureNonBlankString } from '../services/validation';
import {
  BLOCK_PIPELINE_CREATED_NOTE,
  BLOCK_PIPELINE_IFREVISION_FIX,
  BLOCK_PIPELINE_IFREVISION_REQUIRED,
  BLOCK_PIPELINE_NAME_INVALID,
  BLOCK_PIPELINE_NAME_PREFIX_FIX,
  BLOCK_PIPELINE_NAME_PREFIX_INVALID,
  BLOCK_PIPELINE_NAME_REQUIRED,
  BLOCK_PIPELINE_NAMESPACE_INVALID,
  BLOCK_PIPELINE_RESOURCES_EXIST,
  BLOCK_PIPELINE_RESOURCE_STORE_MISSING,
  BLOCK_PIPELINE_TEXTURE_REQUIRED,
  BLOCK_PIPELINE_TOKEN_FIX,
  BLOCK_PIPELINE_VARIANTS_REQUIRED,
  BLOCK_PIPELINE_VERSIONED_FAILED
} from '../shared/messages';

export interface BlockPipelineServiceDeps {
  resources?: ResourceStore;
  createProject: (
    format: 'Java Block/Item',
    name: string,
    options?: { confirmDiscard?: boolean; ifRevision?: string }
  ) => UsecaseResult<{ id: string; format: string; name: string }>;
  runWithoutRevisionGuard: <T>(fn: () => T) => T;
  addBone: (payload: { name: string; pivot: [number, number, number] }) => UsecaseResult<{ id: string; name: string }>;
  addCube: (payload: {
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone: string;
  }) => UsecaseResult<{ id: string; name: string }>;
}

export class BlockPipelineService {
  private readonly resources?: ResourceStore;
  private readonly createProject: BlockPipelineServiceDeps['createProject'];
  private readonly runWithoutRevisionGuard: BlockPipelineServiceDeps['runWithoutRevisionGuard'];
  private readonly addBone: BlockPipelineServiceDeps['addBone'];
  private readonly addCube: BlockPipelineServiceDeps['addCube'];

  constructor(deps: BlockPipelineServiceDeps) {
    this.resources = deps.resources;
    this.createProject = deps.createProject;
    this.runWithoutRevisionGuard = deps.runWithoutRevisionGuard;
    this.addBone = deps.addBone;
    this.addCube = deps.addCube;
  }

  blockPipeline(payload: {
    name: string;
    texture: string;
    namespace?: string;
    variants?: BlockVariant[];
    textures?: BlockPipelineTextures;
    onConflict?: BlockPipelineOnConflict;
    mode?: BlockPipelineMode;
    ifRevision?: string;
  }): UsecaseResult<BlockPipelineResult> {
    const nameBlankErr = ensureNonBlankString(payload.name, 'name');
    if (nameBlankErr) return fail(nameBlankErr);
    const name = String(payload.name ?? '').trim();
    if (!name) {
      return fail({ code: 'invalid_payload', message: BLOCK_PIPELINE_NAME_REQUIRED });
    }
    const textureBlankErr = ensureNonBlankString(payload.texture, 'texture');
    if (textureBlankErr) return fail(textureBlankErr);
    const texture = String(payload.texture ?? '').trim();
    if (!texture) {
      return fail({ code: 'invalid_payload', message: BLOCK_PIPELINE_TEXTURE_REQUIRED });
    }
    const namespaceBlankErr = ensureNonBlankString(payload.namespace, 'namespace');
    if (namespaceBlankErr) return fail(namespaceBlankErr);
    const namespace = normalizeBlockNamespace(payload.namespace);
    if (!isValidResourceToken(namespace)) {
      return fail({
        code: 'invalid_payload',
        message: BLOCK_PIPELINE_NAMESPACE_INVALID(namespace),
        fix: BLOCK_PIPELINE_TOKEN_FIX
      });
    }
    if (!isValidResourceToken(name)) {
      return fail({
        code: 'invalid_payload',
        message: BLOCK_PIPELINE_NAME_INVALID(name),
        fix: BLOCK_PIPELINE_TOKEN_FIX
      });
    }
    if (name.includes(':')) {
      return fail({
        code: 'invalid_payload',
        message: BLOCK_PIPELINE_NAME_PREFIX_INVALID,
        fix: BLOCK_PIPELINE_NAME_PREFIX_FIX
      });
    }
    const variants = normalizeBlockVariants(payload.variants);
    if (variants.length === 0) {
      return fail({
        code: 'invalid_payload',
        message: BLOCK_PIPELINE_VARIANTS_REQUIRED
      });
    }

    const onConflict: BlockPipelineOnConflict = payload.onConflict ?? 'error';
    const mode: BlockPipelineMode = payload.mode ?? 'json_only';
    if (!this.resources) {
      return fail({ code: 'not_implemented', message: BLOCK_PIPELINE_RESOURCE_STORE_MISSING });
    }

    const spec: BlockPipelineSpec = {
      name,
      namespace,
      texture,
      textures: payload.textures,
      variants
    };
    const pipeline = buildBlockPipeline(spec);
    const assets = collectBlockAssets(pipeline.resources);
    const baseEntries = buildBlockResourceEntries(namespace, pipeline.resources);
    const conflicts = baseEntries.filter((entry) => this.resources?.has(entry.uri)).map((entry) => entry.uri);

    let entries = baseEntries;
    let versionSuffix: string | undefined;
    if (conflicts.length > 0) {
      if (onConflict === 'error') {
        return fail({
          code: 'invalid_payload',
          message: BLOCK_PIPELINE_RESOURCES_EXIST,
          details: { conflicts }
        });
      }
      if (onConflict === 'versioned') {
        const resolved = resolveVersionedEntries(this.resources, baseEntries);
        if (!resolved) {
          return fail({
            code: 'invalid_payload',
            message: BLOCK_PIPELINE_VERSIONED_FAILED,
            details: { conflicts }
          });
        }
        entries = resolved.entries;
        versionSuffix = resolved.suffix;
      }
    }

    const notes: string[] = [];
    if (mode === 'with_blockbench') {
      if (!payload.ifRevision) {
        return fail({
          code: 'invalid_state',
          message: BLOCK_PIPELINE_IFREVISION_REQUIRED,
          fix: BLOCK_PIPELINE_IFREVISION_FIX
        });
      }
      const created = this.createProject('Java Block/Item', name, {
        confirmDiscard: onConflict === 'overwrite',
        ifRevision: payload.ifRevision
      });
      if (!created.ok) {
        return fail(created.error);
      }
      const modelRes = this.runWithoutRevisionGuard(() => {
        const boneRes = this.addBone({ name: 'block', pivot: [0, 0, 0] });
        if (!boneRes.ok) return boneRes;
        const cubeRes = this.addCube({
          name: 'block',
          from: [0, 0, 0],
          to: [16, 16, 16],
          bone: 'block'
        });
        if (!cubeRes.ok) return cubeRes;
        return ok({ ok: true });
      });
      if (!modelRes.ok) {
        return fail(modelRes.error);
      }
      notes.push(BLOCK_PIPELINE_CREATED_NOTE);
    }

    entries.forEach((entry) => {
      this.resources?.put({
        uri: entry.uri,
        name: entry.name,
        mimeType: entry.mimeType,
        text: entry.text
      });
    });

    return ok({
      applied: true,
      steps: {
        generate: {
          resources: entries.length
        }
      },
      name,
      namespace,
      variants,
      mode,
      onConflict,
      resources: entries.map((entry) => ({
        uri: entry.uri,
        kind: entry.kind,
        name: entry.name,
        mimeType: entry.mimeType
      })),
      assets,
      ...(versionSuffix ? { versionSuffix } : {}),
      ...(notes.length > 0 ? { notes } : {})
    });
  }
}

type BlockResourceEntry = {
  uri: string;
  kind: BlockResource['kind'];
  name: string;
  mimeType: string;
  text: string;
};

const DEFAULT_BLOCK_NAMESPACE = 'mod';
const VALID_RESOURCE_TOKEN = /^[a-z0-9._-]+$/;

const normalizeBlockNamespace = (value?: string): string => {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_BLOCK_NAMESPACE;
};

const normalizeBlockVariants = (variants?: BlockVariant[]): BlockVariant[] => {
  const list: BlockVariant[] = Array.isArray(variants) && variants.length > 0 ? variants : ['block'];
  const valid: BlockVariant[] = ['block', 'slab', 'stairs', 'wall'];
  const set = new Set<BlockVariant>();
  list.forEach((variant) => {
    if (valid.includes(variant)) {
      set.add(variant);
    }
  });
  return Array.from(set);
};

const isValidResourceToken = (value: string): boolean => VALID_RESOURCE_TOKEN.test(value);

const stripPrefix = (value: string, prefix: string): string =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value;

const buildBlockResourceUri = (namespace: string, resource: BlockResource): string => {
  if (resource.kind === 'blockstate') {
    return `bbmcp://blockstate/${namespace}/${resource.name}`;
  }
  if (resource.kind === 'model') {
    const modelName = stripPrefix(resource.name, 'block/');
    return `bbmcp://model/block/${namespace}/${modelName}`;
  }
  const itemName = stripPrefix(resource.name, 'item/');
  return `bbmcp://model/item/${namespace}/${itemName}`;
};

const collectBlockAssets = (resources: BlockResource[]) => {
  const blockstates: Record<string, unknown> = {};
  const models: Record<string, unknown> = {};
  const items: Record<string, unknown> = {};
  resources.forEach((resource) => {
    if (resource.kind === 'blockstate') {
      blockstates[resource.name] = resource.json;
    } else if (resource.kind === 'model') {
      models[resource.name] = resource.json;
    } else if (resource.kind === 'item') {
      items[resource.name] = resource.json;
    }
  });
  return { blockstates, models, items };
};

const buildBlockResourceEntries = (namespace: string, resources: BlockResource[]): BlockResourceEntry[] =>
  resources.map((resource) => ({
    uri: buildBlockResourceUri(namespace, resource),
    kind: resource.kind,
    name: resource.name,
    mimeType: 'application/json',
    text: JSON.stringify(resource.json, null, 2)
  }));

const appendUriSuffix = (uri: string, suffix: string): string => {
  const idx = uri.lastIndexOf('/');
  if (idx < 0) return `${uri}${suffix}`;
  return `${uri.slice(0, idx + 1)}${uri.slice(idx + 1)}${suffix}`;
};

const resolveVersionedEntries = (
  store: ResourceStore,
  entries: BlockResourceEntry[]
): { suffix: string; entries: BlockResourceEntry[] } | null => {
  for (let version = 2; version < 100; version += 1) {
    const suffix = `_v${version}`;
    const next = entries.map((entry) => ({ ...entry, uri: appendUriSuffix(entry.uri, suffix) }));
    if (next.every((entry) => !store.has(entry.uri))) {
      return { suffix, entries: next };
    }
  }
  return null;
};
