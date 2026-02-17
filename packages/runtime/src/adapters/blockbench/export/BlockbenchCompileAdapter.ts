import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import type { NativeCodecTarget } from '../../../ports/exporter';
import type { BlockbenchCodec, FormatEntry } from '../../../types/blockbench';
import { readGlobals } from '../blockbenchUtils';
import {
  ADAPTER_GLTF_CODEC_UNAVAILABLE,
  ADAPTER_NATIVE_CODEC_UNAVAILABLE,
  ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED,
  ADAPTER_NATIVE_COMPILER_EMPTY,
  ADAPTER_NATIVE_COMPILER_UNAVAILABLE
} from '../../../shared/messages';

export type CompiledCodecSelection = {
  codecId: string;
  codec: BlockbenchCodec;
  compiled: unknown;
};

type CompileFormatResult =
  | { ok: true; compiled: unknown }
  | { ok: false; error: ToolError };

type CompileCodecResult =
  | { ok: true; selection: CompiledCodecSelection }
  | { ok: false; error: ToolError };

type CodecSelection = {
  id: string;
  label: string;
  extensions: string[];
  codec: BlockbenchCodec;
};

export class BlockbenchCompileAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  compileNativeFormat(formatId: string): CompileFormatResult {
    const format = getFormatByLookupIds(resolveNativeFormatLookupIds(formatId));
    const compiler = resolveFormatCompiler(format);
    if (!compiler) {
      return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_UNAVAILABLE(formatId) } };
    }
    try {
      const compiled = compiler();
      if (compiled === null || compiled === undefined) {
        return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_EMPTY } };
      }
      if (isThenable(compiled)) {
        return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED } };
      }
      return { ok: true, compiled };
    } catch (err) {
      const message = errorMessage(err, 'native compile failed');
      this.log.error('native compile error', { message, formatId });
      return { ok: false, error: { code: 'io_error', message } };
    }
  }

  async compileGltf(): Promise<CompileCodecResult> {
    const selected = resolveGltfCodec();
    if (!selected) {
      return { ok: false, error: { code: 'invalid_state', message: ADAPTER_GLTF_CODEC_UNAVAILABLE } };
    }
    return await this.compileCodecSelection(selected);
  }

  async compileCodec(codecId: string): Promise<CompileCodecResult> {
    const selected = resolveCodec(codecId);
    if (!selected) {
      return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_CODEC_UNAVAILABLE(codecId) } };
    }
    return await this.compileCodecSelection(selected);
  }

  listNativeCodecs(): NativeCodecTarget[] {
    return readCodecEntries().map((entry) => ({
      id: entry.id,
      label: entry.label,
      extensions: entry.extensions
    }));
  }

  private async compileCodecSelection(selection: CodecSelection): Promise<CompileCodecResult> {
    const compiler = resolveCodecCompiler(selection.codec);
    if (!compiler) {
      return {
        ok: false,
        error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_UNAVAILABLE(selection.id) }
      };
    }
    try {
      const compiled = await resolveCompile(compiler());
      if (compiled === null || compiled === undefined) {
        return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_EMPTY } };
      }
      return {
        ok: true,
        selection: {
          codecId: selection.id,
          codec: selection.codec,
          compiled
        }
      };
    } catch (err) {
      const message = errorMessage(err, `codec compile failed: ${selection.id}`);
      this.log.error('codec compile error', { message, codecId: selection.id });
      return { ok: false, error: { code: 'io_error', message } };
    }
  }
}

const getFormatById = (formatId: string): FormatEntry | null => {
  const globals = readGlobals();
  const formats = globals.Formats ?? globals.ModelFormat?.formats ?? null;
  if (!formats || typeof formats !== 'object') return null;
  return formats[formatId] ?? null;
};

const listFormatIds = (): string[] => {
  const globals = readGlobals();
  const formats = globals.Formats ?? globals.ModelFormat?.formats ?? null;
  if (!formats || typeof formats !== 'object') return [];
  return Object.keys(formats);
};

const getFormatByLookupIds = (lookupIds: string[]): FormatEntry | null => {
  for (const lookupId of lookupIds) {
    const match = getFormatById(lookupId);
    if (match) return match;
  }
  return null;
};

const resolveNativeFormatLookupIds = (formatId: string): string[] => {
  const raw = String(formatId ?? '').trim();
  if (!raw) return [];
  const normalized = raw.toLowerCase();
  const lookup = [raw];
  if (normalized === 'entity_rig' || normalized === 'entityrig' || normalized === 'entity-rig') {
    const geckoLookup = listFormatIds().filter((id) =>
      normalizeToken(id).includes('gecko')
    );
    lookup.push(...geckoLookup);
  }
  return Array.from(new Set(lookup));
};

const resolveFormatCompiler = (format: FormatEntry | null): (() => unknown) | null => {
  if (!format) return null;
  const compile = format.compile;
  if (typeof compile === 'function') {
    return () => compile.call(format);
  }
  return resolveCodecCompiler(format.codec ?? null);
};

const resolveCodecCompiler = (codec: BlockbenchCodec | null): (() => unknown) | null => {
  if (!codec) return null;
  const compile = codec.compile;
  if (typeof compile !== 'function') return null;
  return () => compile.call(codec);
};

const isThenable = (value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
};

const resolveCompile = async (compiled: unknown): Promise<unknown> => {
  if (!isThenable(compiled)) return compiled;
  return await compiled;
};

const resolveGltfCodec = (): CodecSelection | null => {
  const entries = readCodecEntries();
  const known = ['gltf', 'glb', 'gltf_model', 'gltf_codec'];
  for (const key of known) {
    const entry = entries.find((candidate) => candidate.id === key);
    if (entry) return entry;
  }
  return (
    entries.find(
      (entry) =>
        entry.id.includes('gltf') || entry.extensions.includes('gltf') || entry.extensions.includes('glb')
    ) ?? null
  );
};

const resolveCodec = (codecId: string): CodecSelection | null => {
  const requestToken = normalizeToken(codecId);
  if (!requestToken) return null;
  const entries = readCodecEntries();
  const exact = entries.find((entry) => codecLookupTokens(entry).includes(requestToken));
  if (exact) return exact;
  if (requestToken.length < 3) return null;
  return (
    entries.find((entry) =>
      codecLookupTokens(entry).some((token) => token.includes(requestToken) || requestToken.includes(token))
    ) ?? null
  );
};

const codecLookupTokens = (entry: CodecSelection): string[] => {
  const tokens = [
    entry.id,
    entry.label,
    entry.codec.id ? String(entry.codec.id) : '',
    entry.codec.name ? String(entry.codec.name) : '',
    ...entry.extensions
  ]
    .map((value) => normalizeToken(value))
    .filter(Boolean);
  return Array.from(new Set(tokens));
};

const parseCodecExtensions = (value: unknown): string[] => {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return [];
  return Array.from(
    new Set(
      text
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  );
};

const normalizeToken = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const readCodecEntries = (): CodecSelection[] => {
  const globals = readGlobals();
  const codecs = globals.Codecs;
  if (!codecs || typeof codecs !== 'object') return [];
  const entries = Object.entries(codecs)
    .filter((entry): entry is [string, BlockbenchCodec] => Boolean(entry[1]))
    .map(([key, codec]) => {
      const idRaw = String(codec.id ?? key).trim();
      const id = idRaw.toLowerCase();
      const label = String(codec.name ?? codec.id ?? key).trim();
      const extensions = parseCodecExtensions(codec.extension);
      return { id, label, extensions, codec };
    })
    .filter((entry) => Boolean(entry.id));
  const deduped = new Map<string, CodecSelection>();
  entries.forEach((entry) => {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
    }
  });
  return Array.from(deduped.values());
};
