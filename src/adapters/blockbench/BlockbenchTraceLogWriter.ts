import type { TraceLogWriteMode, TraceLogWriter } from '../../ports/traceLog';
import type { ToolError } from '@ashfox/contracts/types/internal';
import { errorMessage } from '../../logging';
import { toolError } from '../../shared/tooling/toolResponse';
import { loadNativeModule } from '../../shared/nativeModules';
import { readBlockbenchGlobals } from '../../types/blockbench';

export type BlockbenchTraceLogWriterOptions = {
  mode?: TraceLogWriteMode;
  destPath?: string;
  fileName?: string;
};

const DEFAULT_FILE_NAME = 'ashfox-trace.ndjson';

type FsModule = {
  statSync?: (path: string) => { isDirectory?: () => boolean };
};

type PathModule = {
  join?: (...parts: string[]) => string;
};

export class BlockbenchTraceLogWriter implements TraceLogWriter {
  private readonly mode: TraceLogWriteMode;
  private readonly destPath?: string;
  private readonly fileName: string;

  constructor(options: BlockbenchTraceLogWriterOptions = {}) {
    this.mode = options.mode ?? 'auto';
    this.destPath = options.destPath;
    this.fileName = options.fileName ?? DEFAULT_FILE_NAME;
  }

  write(text: string): ToolError | null {
    const globals = readBlockbenchGlobals();
    const blockbench = globals.Blockbench;
    if (!blockbench) {
      return toolError('not_implemented', 'Blockbench API unavailable for trace log write.', {
        reason: 'blockbench_missing'
      });
    }

    const fs = loadNativeModule<FsModule>('fs', { optional: true });
    const path = loadNativeModule<PathModule>('path', { optional: true });
    const resolvedPath = resolveTraceLogPath(
      this.destPath,
      this.fileName,
      globals.Project ?? blockbench.project ?? null,
      fs,
      path
    );
    const writeFile = blockbench.writeFile;
    const exportFile = blockbench.exportFile;
    const canWriteFile = typeof writeFile === 'function';
    const canExport = typeof exportFile === 'function';
    let writeError: ToolError | null = null;

    if (this.mode === 'writeFile' || this.mode === 'auto') {
      if (canWriteFile && resolvedPath) {
        const writeErr = writeTraceLogFile(writeFile, resolvedPath, text, this.fileName, path);
        if (!writeErr) return null;
        writeError = writeErr;
        if (this.mode === 'writeFile') return writeErr;
      }
      if (this.mode === 'writeFile') {
        return toolError('not_implemented', 'Blockbench writeFile unavailable or path not resolved.', {
          reason: 'writefile_unavailable',
          ...(resolvedPath ? {} : { missingPath: true })
        });
      }
    }

    if ((this.mode === 'export' || this.mode === 'auto') && canExport) {
      const exportErr = writeTraceLogExport(exportFile, text, this.fileName);
      if (!exportErr) return null;
      return exportErr;
    }

    if (writeError) {
      return writeError;
    }

    return toolError('not_implemented', 'Blockbench exportFile unavailable for trace log write.', {
      reason: 'export_unavailable'
    });
  }
}

const resolveTraceLogPath = (
  destPath: string | undefined,
  fileName: string,
  project: { save_path?: string; export_path?: string } | null,
  fs?: FsModule | null,
  path?: PathModule | null
): string | null => {
  const trimmed = String(destPath ?? '').trim();
  if (trimmed.length > 0) {
    if (isDirectoryPath(trimmed, fs)) return joinPath(trimmed, fileName, path);
    return trimmed;
  }
  const savePath = project?.save_path ?? project?.export_path ?? '';
  if (!savePath) return null;
  const normalized = savePath.replace(/\\/g, '/');
  const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  if (!dir) return null;
  return joinPath(dir, fileName, path);
};

const isDirectoryPath = (value: string, fs?: FsModule | null): boolean => {
  if (/[\\/]$/.test(value)) return true;
  const statSync = fs?.statSync;
  if (typeof statSync !== 'function') return false;
  try {
    const stat = statSync(value);
    return typeof stat?.isDirectory === 'function' && Boolean(stat.isDirectory());
  } catch (_err) {
    return false;
  }
};

const joinPath = (base: string, fileName: string, path?: PathModule | null): string => {
  const join = path?.join;
  if (typeof join === 'function') return join(base, fileName);
  return `${base.replace(/[\\/]+$/, '')}/${fileName}`;
};

const isEisdirError = (err: unknown): boolean => {
  const code = (err as { code?: unknown })?.code;
  if (code === 'EISDIR') return true;
  const message = errorMessage(err, '').toLowerCase();
  return message.includes('eisdir') || message.includes('is a directory');
};

const writeTraceLogFile = (
  writeFile: (path: string, options: { content: string; savetype: 'text' | 'image' }) => void,
  resolvedPath: string,
  text: string,
  fileName: string,
  path?: PathModule | null
): ToolError | null => {
  try {
    writeFile(resolvedPath, { content: text, savetype: 'text' });
    return null;
  } catch (err) {
    if (isEisdirError(err)) {
      const fallbackPath = joinPath(resolvedPath, fileName, path);
      if (fallbackPath !== resolvedPath) {
        try {
          writeFile(fallbackPath, { content: text, savetype: 'text' });
          return null;
        } catch (retryErr) {
          return toolError('io_error', errorMessage(retryErr, 'Trace log write failed.'), {
            reason: 'trace_log_write_failed',
            path: fallbackPath
          });
        }
      }
    }
    return toolError('io_error', errorMessage(err, 'Trace log write failed.'), {
      reason: 'trace_log_write_failed',
      path: resolvedPath
    });
  }
};

const writeTraceLogExport = (
  exportFile: (options: { content: string; name: string }) => void,
  text: string,
  fileName: string
): ToolError | null => {
  try {
    exportFile({ content: text, name: fileName });
    return null;
  } catch (err) {
    return toolError('io_error', errorMessage(err, 'Trace log export failed.'), {
      reason: 'trace_log_export_failed',
      name: fileName
    });
  }
};






