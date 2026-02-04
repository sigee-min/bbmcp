import type { TraceLogWriteMode, TraceLogWriter } from '../../ports/traceLog';
import type { ToolError } from '../../types';
import { toolError } from '../../shared/tooling/toolResponse';
import { readBlockbenchGlobals } from '../../types/blockbench';

export type BlockbenchTraceLogWriterOptions = {
  mode?: TraceLogWriteMode;
  destPath?: string;
  fileName?: string;
};

const DEFAULT_FILE_NAME = 'bbmcp-trace.ndjson';

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

    const resolvedPath = resolveTraceLogPath(this.destPath, this.fileName, globals.Project ?? blockbench.project ?? null);
    const writeFile = blockbench.writeFile;
    const exportFile = blockbench.exportFile;
    const canWriteFile = typeof writeFile === 'function';
    const canExport = typeof exportFile === 'function';

    if (this.mode === 'writeFile' || this.mode === 'auto') {
      if (canWriteFile && resolvedPath) {
        writeFile(resolvedPath, { content: text, savetype: 'text' });
        return null;
      }
      if (this.mode === 'writeFile') {
        return toolError('not_implemented', 'Blockbench writeFile unavailable or path not resolved.', {
          reason: 'writefile_unavailable',
          ...(resolvedPath ? {} : { missingPath: true })
        });
      }
    }

    if ((this.mode === 'export' || this.mode === 'auto') && canExport) {
      exportFile({ content: text, name: this.fileName });
      return null;
    }

    return toolError('not_implemented', 'Blockbench exportFile unavailable for trace log write.', {
      reason: 'export_unavailable'
    });
  }
}

const resolveTraceLogPath = (
  destPath: string | undefined,
  fileName: string,
  project: { save_path?: string; export_path?: string } | null
): string | null => {
  if (destPath && destPath.trim().length > 0) return destPath;
  const savePath = project?.save_path ?? project?.export_path ?? '';
  if (!savePath) return null;
  const normalized = savePath.replace(/\\/g, '/');
  const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  if (!dir) return null;
  return `${dir}/${fileName}`;
};




