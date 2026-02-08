import type { ToolError } from '@ashfox/contracts/types/internal';

export type TraceLogWriteMode = 'auto' | 'writeFile' | 'export';

export type TraceLogWriteOptions = {
  mode?: TraceLogWriteMode;
  destPath?: string;
  fileName?: string;
};

export interface TraceLogWriter {
  write: (text: string) => ToolError | null;
}

export interface TraceLogWriterFactory {
  create: (options?: TraceLogWriteOptions) => TraceLogWriter;
}




