import { ExportPort, ExportNativeParams } from '../../ports/exporter';
import { ToolError } from '../../types';
import { Logger } from '../../logging';
import { FormatEntry, readBlockbenchGlobals } from '../../types/blockbench';

export class BlockbenchExport implements ExportPort {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  exportNative(params: ExportNativeParams): ToolError | null {
    try {
      const blockbench = readBlockbenchGlobals().Blockbench;
      if (!blockbench?.writeFile) {
        return { code: 'not_implemented', message: 'Blockbench.writeFile not available' };
      }
      const format = getFormatById(params.formatId);
      const compiler = resolveCompiler(format);
      if (!compiler) {
        return { code: 'not_implemented', message: `Native compiler not available for ${params.formatId}` };
      }
      const compiled = compiler();
      if (compiled === null || compiled === undefined) {
        return { code: 'not_implemented', message: 'Native compiler returned empty result' };
      }
      if (isThenable(compiled)) {
        return { code: 'not_implemented', message: 'Async compiler not supported' };
      }
      const serialized = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
      blockbench.writeFile(params.destPath, { content: serialized, savetype: 'text' });
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'native export failed';
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
    return () => compile();
  }
  const codecCompile = format.codec?.compile;
  if (typeof codecCompile === 'function') {
    return () => codecCompile();
  }
  return null;
}

function isThenable(value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
}
