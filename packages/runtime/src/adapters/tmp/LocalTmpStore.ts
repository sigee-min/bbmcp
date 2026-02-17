import type { ToolError } from '@ashfox/contracts/types/internal';
import type { TmpSaveResult, TmpStorePort } from '../../ports/tmpStore';
import { errorMessage } from '../../logging';
import { toolError } from '../../shared/tooling/toolResponse';
import {
  TMP_STORE_BASE64_DECODE_FAILED,
  TMP_STORE_DATA_URI_INVALID,
  TMP_STORE_DIR_CREATE_FAILED,
  TMP_STORE_FILESYSTEM_UNAVAILABLE,
  TMP_STORE_PERMISSION_MESSAGE,
  TMP_STORE_WRITE_FAILED
} from '../../shared/messages';
import { loadNativeModule } from '../../shared/nativeModules';

type FsModule = {
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  writeFileSync: (path: string, data: Uint8Array) => void;
};

type PathModule = {
  join: (...parts: string[]) => string;
  resolve: (...parts: string[]) => string;
};

const sanitizeName = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

const guessExtension = (mimeType: string): string => {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
};

const parseDataUri = (dataUri: string): { mimeType: string; base64: string } | null => {
  const raw = String(dataUri ?? '');
  const match = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
};

export const saveDataUriToTmp = (
  dataUri: string,
  options?: { nameHint?: string; prefix?: string; cwd?: string }
): { ok: true; data: TmpSaveResult } | { ok: false; error: ToolError } => {
  const parsed = parseDataUri(dataUri);
  if (!parsed) {
    return { ok: false, error: toolError('invalid_payload', TMP_STORE_DATA_URI_INVALID) };
  }
  const fs = loadNativeModule<FsModule>('fs', {
    message: TMP_STORE_PERMISSION_MESSAGE,
    optional: true
  });
  const path = loadNativeModule<PathModule>('path', {
    message: TMP_STORE_PERMISSION_MESSAGE,
    optional: true
  });
  if (!fs || !path) {
    return { ok: false, error: toolError('invalid_state', TMP_STORE_FILESYSTEM_UNAVAILABLE) };
  }
  const root = options?.cwd ?? (typeof process !== 'undefined' && process.cwd ? process.cwd() : '.');
  const baseDir = path.resolve(root, '.ashfox', 'tmp');
  try {
    fs.mkdirSync(baseDir, { recursive: true });
  } catch (err) {
    const message = errorMessage(err, TMP_STORE_DIR_CREATE_FAILED);
    return { ok: false, error: toolError('io_error', message) };
  }
  const prefix = sanitizeName(options?.prefix ?? 'image');
  const nameHint = sanitizeName(options?.nameHint ?? '');
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const ext = guessExtension(parsed.mimeType);
  const baseName = nameHint || prefix || 'image';
  const fileName = `${baseName}_${stamp}_${rand}.${ext}`;
  const filePath = path.join(baseDir, fileName);
  let buffer: Uint8Array;
  try {
    buffer = Buffer.from(parsed.base64, 'base64');
  } catch (err) {
    return { ok: false, error: toolError('invalid_payload', TMP_STORE_BASE64_DECODE_FAILED) };
  }
  try {
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    const message = errorMessage(err, TMP_STORE_WRITE_FAILED);
    return { ok: false, error: toolError('io_error', message) };
  }
  return { ok: true, data: { path: filePath, mimeType: parsed.mimeType, byteLength: buffer.byteLength } };
};

export class LocalTmpStore implements TmpStorePort {
  saveDataUri(
    dataUri: string,
    options?: { nameHint?: string; prefix?: string; cwd?: string }
  ): { ok: true; data: TmpSaveResult } | { ok: false; error: ToolError } {
    return saveDataUriToTmp(dataUri, options);
  }
}




