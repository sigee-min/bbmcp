import type { TextureResolution } from '../../../src/ports/editor';
import type { FormatDescriptor } from '../../../src/ports/formats';
import type { FormatKind } from '../../../src/types';

export type BlockbenchSpecSource = {
  name: string;
  url: string;
  checkedAt: string;
  note?: string;
};

export type BlockbenchSpecBreakingChange = {
  version: string;
  releaseDate?: string;
  notes?: string;
};

export type BlockbenchSpecFeature = {
  since?: string;
  formatFlag?: string;
  bbmodelFields?: string[];
  notes?: string;
};

export type BlockbenchSpecFormat = {
  id: string;
  name?: string;
  singleTexture?: boolean;
  perTextureUvSize?: boolean;
  notes?: string;
  confidence?: 'assumed' | 'verified' | 'unknown';
};

export type BlockbenchSpecSnapshot = {
  blockbench: {
    version: string;
    releaseTag?: string;
    releaseDate?: string;
    releaseUrl?: string;
  };
  bbmodel: {
    formatVersionField?: string;
    breakingChanges?: BlockbenchSpecBreakingChange[];
    notes?: string;
  };
  features?: Record<string, BlockbenchSpecFeature>;
  formats?: Record<string, BlockbenchSpecFormat>;
  aliases?: Record<string, string>;
  defaults?: {
    textureResolution?: TextureResolution;
  };
  sources?: BlockbenchSpecSource[];
  updatedAt?: string;
};

const FALLBACK_RESOLUTION: TextureResolution = { width: 16, height: 16 };

const normalizeResolution = (value?: TextureResolution | null): TextureResolution => {
  if (!value) return { ...FALLBACK_RESOLUTION };
  const width = Number.isFinite(value.width) && value.width > 0 ? Math.trunc(value.width) : FALLBACK_RESOLUTION.width;
  const height = Number.isFinite(value.height) && value.height > 0 ? Math.trunc(value.height) : FALLBACK_RESOLUTION.height;
  return { width, height };
};

const loadSnapshot = (): BlockbenchSpecSnapshot => {
  try {
    return require('../../../../../config/specs/blockbench-spec-snapshot.json') as BlockbenchSpecSnapshot;
  } catch (err) {
    return {
      blockbench: { version: 'unknown' },
      bbmodel: { formatVersionField: 'format_version' },
      defaults: { textureResolution: { ...FALLBACK_RESOLUTION } },
      sources: [],
      updatedAt: undefined
    };
  }
};

const rawSnapshot = loadSnapshot();
const rawBlockbench = rawSnapshot.blockbench ?? {};
const rawBbmodel = rawSnapshot.bbmodel ?? {};
const blockbenchVersion =
  typeof rawBlockbench.version === 'string' && rawBlockbench.version.length > 0
    ? rawBlockbench.version
    : 'unknown';
const bbmodelFormatVersionField =
  typeof rawBbmodel.formatVersionField === 'string' && rawBbmodel.formatVersionField.length > 0
    ? rawBbmodel.formatVersionField
    : 'format_version';

export const BLOCKBENCH_SPEC_SNAPSHOT: BlockbenchSpecSnapshot = {
  blockbench: { ...rawBlockbench, version: blockbenchVersion },
  bbmodel: { ...rawBbmodel, formatVersionField: bbmodelFormatVersionField },
  features: rawSnapshot.features ?? {},
  formats: rawSnapshot.formats ?? {},
  aliases: rawSnapshot.aliases ?? {},
  defaults: {
    textureResolution: normalizeResolution(rawSnapshot.defaults?.textureResolution ?? null)
  },
  sources: Array.isArray(rawSnapshot.sources) ? rawSnapshot.sources : [],
  updatedAt: rawSnapshot.updatedAt
};

export const getBlockbenchSpecSnapshot = (): BlockbenchSpecSnapshot => BLOCKBENCH_SPEC_SNAPSHOT;

export const getDefaultTextureResolution = (spec: BlockbenchSpecSnapshot = BLOCKBENCH_SPEC_SNAPSHOT): TextureResolution =>
  normalizeResolution(spec.defaults?.textureResolution ?? null);

const resolveFormatKey = (
  spec: BlockbenchSpecSnapshot,
  formatId?: string | null,
  formatKind?: FormatKind | null
): string | null => {
  if (formatId && spec.formats && spec.formats[formatId]) return formatId;
  if (formatKind && spec.aliases && spec.aliases[formatKind]) return spec.aliases[formatKind];
  if (formatKind && spec.formats && spec.formats[formatKind]) return formatKind;
  return formatId ?? formatKind ?? null;
};

export const getFormatSpec = (
  spec: BlockbenchSpecSnapshot,
  formatId?: string | null,
  formatKind?: FormatKind | null
): BlockbenchSpecFormat | null => {
  const key = resolveFormatKey(spec, formatId, formatKind);
  if (!key || !spec.formats) return null;
  return spec.formats[key] ?? null;
};

export const getFormatDescriptor = (
  spec: BlockbenchSpecSnapshot,
  formatId?: string | null,
  formatKind?: FormatKind | null
): FormatDescriptor | null => {
  const entry = getFormatSpec(spec, formatId, formatKind);
  const id = entry?.id ?? formatId ?? (formatKind ?? null);
  if (!id) return null;
  const descriptor: FormatDescriptor = { id, name: entry?.name ?? (formatKind ?? id) };
  if (entry?.singleTexture !== undefined) descriptor.singleTexture = entry.singleTexture;
  if (entry?.perTextureUvSize !== undefined) descriptor.perTextureUvSize = entry.perTextureUvSize;
  return descriptor;
};


