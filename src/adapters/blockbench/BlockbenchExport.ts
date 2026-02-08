import { ExportPort, ExportNativeParams } from '../../ports/exporter';
import { ToolError } from '../../types/internal';
import { errorMessage, Logger } from '../../logging';
import { FormatEntry, readBlockbenchGlobals } from '../../types/blockbench';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
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
      if (compiled === null || compiled === undefined) {
        return { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_EMPTY };
      }
      if (isThenable(compiled)) {
        return { code: 'not_implemented', message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED };
      }
      const serialized = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
      blockbench.writeFile(params.destPath, { content: serialized, savetype: 'text' });
      return null;
    } catch (err) {
      const message = errorMessage(err, 'native export failed');
      this.log.error('native export error', { message });
      return { code: 'io_error', message };
    }
  }
}

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
  const codec = format.codec;
  const codecCompile = codec?.compile;
  if (typeof codecCompile === 'function') {
    return () => codecCompile.call(codec);
  }
  return null;
}

function isThenable(value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
}



