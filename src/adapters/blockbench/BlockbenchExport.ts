import {
  ExportCodecParams,
  ExportGltfParams,
  ExportPort,
  ExportNativeParams,
  NativeCodecTarget
} from '../../ports/exporter';
import { ToolError } from '@ashfox/contracts/types/internal';
import { errorMessage, Logger } from '../../logging';
import { BlockbenchCodec, FormatEntry, readBlockbenchGlobals } from '../../types/blockbench';
import { loadNativeModule } from '../../shared/nativeModules';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
  ADAPTER_FILESYSTEM_WRITE_UNAVAILABLE,
  ADAPTER_GLTF_CODEC_UNAVAILABLE,
  ADAPTER_NATIVE_CODEC_UNAVAILABLE,
  ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE,
  ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED,
  ADAPTER_NATIVE_COMPILER_EMPTY,
  ADAPTER_NATIVE_COMPILER_UNAVAILABLE
} from '../../shared/messages';

export class BlockbenchExport implements ExportPort {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  exportNative(params: ExportNativeParams): ToolError | null {
    try {
      const blockbench = readBlockbenchGlobals().Blockbench;
      if (!blockbench?.writeFile) {
        return { code: 'not_implemented', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE };
      }
      const format = getFormatById(params.formatId);
      const compiler = resolveCompiler(format);
      if (!compiler) {
        return { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_UNAVAILABLE(params.formatId) };
      }
      const compiled = compiler();
      const text = resolveTextCompile(compiled);
      if (!text.ok) return text.error;
      blockbench.writeFile(params.destPath, { content: text.value, savetype: 'text' });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'native export failed');
      this.log.error('native export error', { message });
      return { code: 'io_error', message };
    }
  }

  async exportGltf(params: ExportGltfParams): Promise<ToolError | null> {
    try {
      const globals = readBlockbenchGlobals();
      const selected = resolveGltfCodec(globals);
      if (!selected) {
        return { code: 'not_implemented', message: ADAPTER_GLTF_CODEC_UNAVAILABLE };
      }
      return await exportWithCodec(globals, selected.codec, params.destPath, selected.id);
    } catch (err) {
      const message = errorMessage(err, 'gltf export failed');
      this.log.error('gltf export error', { message });
      return { code: 'io_error', message };
    }
  }

  async exportCodec(params: ExportCodecParams): Promise<ToolError | null> {
    try {
      const globals = readBlockbenchGlobals();
      const selected = resolveCodec(globals, params.codecId);
      if (!selected) {
        return { code: 'not_implemented', message: ADAPTER_NATIVE_CODEC_UNAVAILABLE(params.codecId) };
      }
      return await exportWithCodec(globals, selected.codec, params.destPath, selected.id);
    } catch (err) {
      const message = errorMessage(err, `codec export failed: ${params.codecId}`);
      this.log.error('codec export error', { message, codecId: params.codecId });
      return { code: 'io_error', message };
    }
  }

  listNativeCodecs(): NativeCodecTarget[] {
    const globals = readBlockbenchGlobals();
    return listNativeCodecTargets(globals);
  }
}

type CodecSelection = {
  id: string;
  label: string;
  extensions: string[];
  codec: BlockbenchCodec;
};

function getFormatById(formatId: string): FormatEntry | null {
  const globals = readBlockbenchGlobals();
  const formats = globals.Formats ?? globals.ModelFormat?.formats ?? null;
  if (!formats || typeof formats !== 'object') return null;
  return formats[formatId] ?? null;
}

function resolveCompiler(format: FormatEntry | null): (() => unknown) | null {
  if (!format) return null;
  const compile = format.compile;
  if (typeof compile === 'function') {
    return () => compile.call(format);
  }
  return resolveCodecCompiler(format.codec ?? null);
}

function isThenable(value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
}

function resolveCodecCompiler(codec: BlockbenchCodec | null): (() => unknown) | null {
  if (!codec) return null;
  const compile = codec.compile;
  if (typeof compile !== 'function') return null;
  return () => compile.call(codec);
}

function resolveTextCompile(compiled: unknown): { ok: true; value: string } | { ok: false; error: ToolError } {
  if (compiled === null || compiled === undefined) {
    return { ok: false, error: { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_EMPTY } };
  }
  if (isThenable(compiled)) {
    return { ok: false, error: { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED } };
  }
  const value = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
  return { ok: true, value };
}

async function resolveCompile(compiled: unknown): Promise<unknown> {
  if (!isThenable(compiled)) return compiled;
  return await compiled;
}

function resolveGltfCodec(globals: ReturnType<typeof readBlockbenchGlobals>): CodecSelection | null {
  const entries = readCodecEntries(globals);
  const known = ['gltf', 'glb', 'gltf_model', 'gltf_codec'];
  for (const key of known) {
    const entry = entries.find((candidate) => candidate.id === key);
    if (entry) return entry;
  }
  return entries.find((entry) => entry.id.includes('gltf') || entry.extensions.includes('gltf') || entry.extensions.includes('glb')) ?? null;
}

function resolveCodec(
  globals: ReturnType<typeof readBlockbenchGlobals>,
  codecId: string
): CodecSelection | null {
  const requestToken = normalizeToken(codecId);
  if (!requestToken) return null;
  const entries = readCodecEntries(globals);
  const exact = entries.find((entry) => codecLookupTokens(entry).includes(requestToken));
  if (exact) return exact;
  if (requestToken.length < 3) return null;
  return entries.find((entry) =>
    codecLookupTokens(entry).some((token) => token.includes(requestToken) || requestToken.includes(token))
  ) ?? null;
}

function listNativeCodecTargets(globals: ReturnType<typeof readBlockbenchGlobals>): NativeCodecTarget[] {
  return readCodecEntries(globals).map((entry) => ({
    id: entry.id,
    label: entry.label,
    extensions: entry.extensions
  }));
}

function codecLookupTokens(entry: CodecSelection): string[] {
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
}

function parseCodecExtensions(value: unknown): string[] {
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
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function readCodecEntries(globals: ReturnType<typeof readBlockbenchGlobals>): CodecSelection[] {
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
}

async function exportWithCodec(
  globals: ReturnType<typeof readBlockbenchGlobals>,
  codec: BlockbenchCodec,
  destPath: string,
  codecId: string
): Promise<ToolError | null> {
  const compiler = resolveCodecCompiler(codec);
  if (!compiler) {
    return { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_UNAVAILABLE(codecId) };
  }
  const compiled = await resolveCompile(compiler());
  if (compiled === null || compiled === undefined) {
    return { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_EMPTY };
  }

  const writeErr = await writeWithCodec(codec, compiled, destPath);
  if (!writeErr) return null;

  const blockbench = globals.Blockbench;
  if (canFallbackFromCodecWriteError(writeErr) && blockbench?.writeFile && (typeof compiled === 'string' || isPlainObject(compiled))) {
    const serialized = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
    blockbench.writeFile(destPath, { content: serialized, savetype: 'text' });
    return null;
  }
  const binary = canFallbackFromCodecWriteError(writeErr) ? toBinary(compiled) : null;
  if (binary) {
    const fsErr = writeBinaryFile(destPath, binary);
    if (!fsErr) return null;
    return fsErr;
  }
  return writeErr;
}

async function writeWithCodec(codec: BlockbenchCodec, compiled: unknown, destPath: string): Promise<ToolError | null> {
  const write = codec.write;
  if (typeof write !== 'function') {
    return { code: 'not_implemented', message: ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE };
  }
  const writeResult = write.call(codec, compiled, destPath);
  if (isThenable(writeResult)) {
    await writeResult;
  }
  return null;
}

function canFallbackFromCodecWriteError(error: ToolError): boolean {
  if (error.code !== 'not_implemented') return false;
  return error.message === ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toBinary(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!value || typeof value !== 'object') return null;
  const withBuffer = value as { buffer?: unknown };
  if (withBuffer.buffer instanceof ArrayBuffer) {
    return new Uint8Array(withBuffer.buffer);
  }
  return null;
}

type FsModule = {
  writeFileSync: (path: string, data: Uint8Array) => void;
};

function writeBinaryFile(destPath: string, data: Uint8Array): ToolError | null {
  const fs = loadNativeModule<FsModule>('fs', { optional: true });
  if (!fs) return { code: 'not_implemented', message: ADAPTER_FILESYSTEM_WRITE_UNAVAILABLE };
  try {
    fs.writeFileSync(destPath, data);
    return null;
  } catch (err) {
    const message = errorMessage(err, 'binary write failed');
    return { code: 'io_error', message };
  }
}



