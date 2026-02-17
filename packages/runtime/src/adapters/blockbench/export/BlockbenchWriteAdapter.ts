import type { ToolError } from '@ashfox/contracts/types/internal';
import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import { loadNativeModule } from '../../../shared/nativeModules';
import type { BlockbenchCodec } from '../../../types/blockbench';
import { readGlobals } from '../blockbenchUtils';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
  ADAPTER_FILESYSTEM_WRITE_UNAVAILABLE,
  ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE,
  ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED,
  ADAPTER_NATIVE_COMPILER_EMPTY
} from '../../../shared/messages';
import {
  isEisdirError,
  joinPath,
  resolveDirectoryAwarePath,
  type FsPathPolicyModule,
  type PathPolicyModule
} from '../io/pathPolicy';

type FsModule = FsPathPolicyModule & {
  writeFileSync: (path: string, data: Uint8Array | string) => void;
};

export class BlockbenchWriteAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  writeNativeText(destPath: string, compiled: unknown, defaultFileName = 'model.json'): ToolError | null {
    const textResult = resolveTextCompile(compiled);
    if (!textResult.ok) return textResult.error;
    return this.writeText(destPath, textResult.value, defaultFileName);
  }

  async writeCodecOutput(
    destPath: string,
    codecId: string,
    codec: BlockbenchCodec,
    compiled: unknown
  ): Promise<ToolError | null> {
    const writeErr = await this.writeWithCodec(codec, compiled, destPath);
    if (!writeErr) return null;

    if (canFallbackFromCodecWriteError(writeErr)) {
      if (typeof compiled === 'string' || isPlainObject(compiled)) {
        const serialized = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
        const fallbackErr = this.writeText(destPath, serialized, `model.${codecId}`);
        if (!fallbackErr) return null;
      }
      const binary = toBinary(compiled);
      if (binary) {
        const binaryErr = this.writeBinary(destPath, binary, `model.${codecId}`);
        if (!binaryErr) return null;
      }
    }
    return writeErr;
  }

  private writeText(destPath: string, contents: string, defaultFileName: string): ToolError | null {
    const globals = readGlobals();
    const blockbench = globals.Blockbench;
    const fs = loadNativeModule<FsModule>('fs', { optional: true });
    const path = loadNativeModule<PathPolicyModule>('path', { optional: true });
    const resolvedPath = resolveDirectoryAwarePath(destPath, defaultFileName, fs, path);
    if (!blockbench?.writeFile) {
      if (fs?.writeFileSync) {
        return this.writeTextWithFs(fs, resolvedPath, contents, defaultFileName, path);
      }
      return { code: 'invalid_state', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE };
    }
    try {
      blockbench.writeFile(resolvedPath, { content: contents, savetype: 'text' });
      return null;
    } catch (err) {
      if (isEisdirError(err)) {
        const fallbackPath = joinPath(resolvedPath, defaultFileName, path);
        if (fallbackPath !== resolvedPath) {
          try {
            blockbench.writeFile(fallbackPath, { content: contents, savetype: 'text' });
            return null;
          } catch (retryErr) {
            const message = errorMessage(retryErr, 'write failed');
            this.log.error('write text fallback error', { message, path: fallbackPath });
            return { code: 'io_error', message };
          }
        }
      }
      const message = errorMessage(err, 'write failed');
      this.log.error('write text error', { message, path: resolvedPath });
      return { code: 'io_error', message };
    }
  }

  private writeTextWithFs(
    fs: FsModule,
    resolvedPath: string,
    contents: string,
    defaultFileName: string,
    path?: PathPolicyModule | null
  ): ToolError | null {
    try {
      fs.writeFileSync(resolvedPath, contents);
      return null;
    } catch (err) {
      if (isEisdirError(err)) {
        const fallbackPath = joinPath(resolvedPath, defaultFileName, path);
        if (fallbackPath !== resolvedPath) {
          try {
            fs.writeFileSync(fallbackPath, contents);
            return null;
          } catch (retryErr) {
            const message = errorMessage(retryErr, 'write failed');
            this.log.error('write text fs fallback error', { message, path: fallbackPath });
            return { code: 'io_error', message };
          }
        }
      }
      const message = errorMessage(err, 'write failed');
      this.log.error('write text fs error', { message, path: resolvedPath });
      return { code: 'io_error', message };
    }
  }

  private writeBinary(destPath: string, data: Uint8Array, defaultFileName: string): ToolError | null {
    const fs = loadNativeModule<FsModule>('fs', { optional: true });
    if (!fs) return { code: 'invalid_state', message: ADAPTER_FILESYSTEM_WRITE_UNAVAILABLE };
    const path = loadNativeModule<PathPolicyModule>('path', { optional: true });
    const resolvedPath = resolveDirectoryAwarePath(destPath, defaultFileName, fs, path);
    try {
      fs.writeFileSync(resolvedPath, data);
      return null;
    } catch (err) {
      const message = errorMessage(err, 'binary write failed');
      this.log.error('write binary error', { message, path: resolvedPath });
      return { code: 'io_error', message };
    }
  }

  private async writeWithCodec(
    codec: BlockbenchCodec,
    compiled: unknown,
    destPath: string
  ): Promise<ToolError | null> {
    const write = codec.write;
    if (typeof write !== 'function') {
      return { code: 'invalid_state', message: ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE };
    }
    try {
      const writeResult = write.call(codec, compiled, destPath);
      if (isThenable(writeResult)) {
        await writeResult;
      }
      return null;
    } catch (err) {
      const message = errorMessage(err, 'codec write failed');
      this.log.error('codec write error', { message });
      return { code: 'io_error', message };
    }
  }
}

const isThenable = (value: unknown): value is { then: (onFulfilled: (arg: unknown) => unknown) => unknown } => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { then?: unknown };
  return typeof candidate.then === 'function';
};

const resolveTextCompile = (compiled: unknown): { ok: true; value: string } | { ok: false; error: ToolError } => {
  if (compiled === null || compiled === undefined) {
    return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_EMPTY } };
  }
  if (isThenable(compiled)) {
    return { ok: false, error: { code: 'invalid_state', message: ADAPTER_NATIVE_COMPILER_ASYNC_UNSUPPORTED } };
  }
  const value = typeof compiled === 'string' ? compiled : JSON.stringify(compiled ?? {}, null, 2);
  return { ok: true, value };
};

const canFallbackFromCodecWriteError = (error: ToolError): boolean => {
  if (error.code !== 'invalid_state') return false;
  return error.message === ADAPTER_NATIVE_CODEC_WRITE_UNAVAILABLE;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toBinary = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (!value || typeof value !== 'object') return null;
  const withBuffer = value as { buffer?: unknown };
  if (withBuffer.buffer instanceof ArrayBuffer) {
    return new Uint8Array(withBuffer.buffer);
  }
  return null;
};
